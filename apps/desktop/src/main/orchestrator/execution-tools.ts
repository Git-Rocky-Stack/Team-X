import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import type { ToolSpec } from '@team-x/provider-router';

import { resolveRuntimeWorkspacePaths } from '../services/runtime-workspace-service.js';

const execFileAsync = promisify(execFile);

export interface ExecutionToolDeps {
  userDataDir: string;
  companySlug: string;
  companyId?: string;
  employeeId: string;
  workspaceRoot?: string | null;
  vault?: {
    store(
      companyId: string,
      sourcePath: string,
      uploadedBy: string,
      tags?: string[],
      uploadedByKind?: 'user' | 'employee' | 'system',
    ): Promise<string>;
  };
}

// ---------------------------------------------------------------------------
// Path safety — every filesystem operation is sandboxed to the employee's
// workspace.  Traversal outside the workspace is rejected.
// ---------------------------------------------------------------------------

function resolveWorkspacePath(
  requestedPath: string,
  workspaceRoot: string,
): { safePath: string; relativePath: string } {
  const absolute = resolve(workspaceRoot, requestedPath);
  const rel = relative(workspaceRoot, absolute);

  if (rel.startsWith('..') || rel === '..') {
    throw new Error(`Path traversal blocked: '${requestedPath}' resolves outside the workspace.`);
  }
  return { safePath: absolute, relativePath: rel };
}

function getWorkspaceRoot(deps: ExecutionToolDeps): string {
  if (typeof deps.workspaceRoot === 'string' && deps.workspaceRoot.trim().length > 0) {
    return resolve(deps.workspaceRoot.trim());
  }

  const paths = resolveRuntimeWorkspacePaths({
    userDataDir: deps.userDataDir,
    companySlug: deps.companySlug,
    employeeId: deps.employeeId,
    runtimeKind: 'teamx-internal',
  });
  return paths.workspace;
}

async function ensureWorkspace(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
}

// ---------------------------------------------------------------------------
// filesystem — read, write, list, search, delete
// ---------------------------------------------------------------------------

interface FilesystemArgs {
  operation: 'read' | 'write' | 'list' | 'delete' | 'search';
  path: string;
  content?: string;
  pattern?: string;
}

const SEARCH_MAX_RESULTS = 200;
const SEARCH_IGNORED_DIRS = new Set([
  '.cache',
  '.git',
  '.hg',
  '.next',
  '.nuxt',
  '.parcel-cache',
  '.svn',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release',
  'vendor',
]);

function buildFilesystemTool(deps: ExecutionToolDeps): ToolSpec {
  return {
    name: 'filesystem',
    description:
      'Read, write, list, delete, or search files within your workspace. ' +
      'Operations: read (returns content), write (creates/overwrites), ' +
      'list (returns directory entries), delete (removes file or empty dir), ' +
      'search (recursive filename search by glob pattern).',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['read', 'write', 'list', 'delete', 'search'],
          description: 'The filesystem operation to perform.',
        },
        path: {
          type: 'string',
          description: 'Relative path within your workspace.',
        },
        content: {
          type: 'string',
          description: 'Content to write (required for write operation).',
        },
        pattern: {
          type: 'string',
          description: 'Search pattern, e.g. "*.ts" or "README*" (required for search operation).',
        },
      },
      required: ['operation', 'path'],
    },
    execute: (async (rawArgs: unknown): Promise<unknown> => {
      const args = rawArgs as FilesystemArgs;
      const workspaceRoot = getWorkspaceRoot(deps);
      await ensureWorkspace(workspaceRoot);

      const { safePath } = resolveWorkspacePath(args.path, workspaceRoot);

      switch (args.operation) {
        case 'read': {
          try {
            const content = await readFile(safePath, 'utf-8');
            return { success: true, content };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        case 'write': {
          if (args.content === undefined) {
            return { success: false, error: 'Missing "content" for write operation.' };
          }
          try {
            await mkdir(dirname(safePath), { recursive: true });
            await writeFile(safePath, args.content, 'utf-8');
            return { success: true, path: args.path };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        case 'list': {
          try {
            const entries = await readdir(safePath, { withFileTypes: true });
            return {
              success: true,
              entries: entries.map((e) => ({
                name: e.name,
                type: e.isDirectory() ? 'directory' : 'file',
              })),
            };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        case 'delete': {
          try {
            const s = await stat(safePath);
            if (s.isDirectory()) {
              await rm(safePath, { recursive: false });
            } else {
              await rm(safePath);
            }
            return { success: true, path: args.path };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        case 'search': {
          if (!args.pattern) {
            return { success: false, error: 'Missing "pattern" for search operation.' };
          }
          try {
            const results = await searchFiles(workspaceRoot, safePath, args.pattern);
            return {
              success: true,
              matches: results.matches,
              truncated: results.truncated,
              maxResults: SEARCH_MAX_RESULTS,
              ignoredDirectories: [...SEARCH_IGNORED_DIRS],
            };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        default:
          return { success: false, error: `Unknown operation: ${args.operation}` };
      }
    }) as ToolSpec['execute'],
  };
}

interface SearchResult {
  matches: string[];
  truncated: boolean;
}

async function searchFiles(
  workspaceRoot: string,
  searchRoot: string,
  pattern: string,
): Promise<SearchResult> {
  const results: string[] = [];
  let truncated = false;

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= SEARCH_MAX_RESULTS) {
        truncated = true;
        return;
      }

      const fullPath = join(directory, entry.name);
      const rel = relative(workspaceRoot, fullPath);

      if (entry.isDirectory()) {
        if (SEARCH_IGNORED_DIRS.has(entry.name)) continue;
        await visit(fullPath);
      } else if (entry.isFile() && matchGlob(entry.name, pattern)) {
        results.push(rel);
      }
    }
  }

  await visit(searchRoot);
  return { matches: results, truncated };
}

function matchGlob(filename: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
  return regex.test(filename);
}

// ---------------------------------------------------------------------------
// create_document — create deliverable files, including Office Open XML
// ---------------------------------------------------------------------------

type DocumentFormat = 'txt' | 'md' | 'csv' | 'json' | 'html' | 'docx' | 'xlsx' | 'pptx';

interface CreateDocumentArgs {
  path: string;
  format?:
    | 'txt'
    | 'md'
    | 'markdown'
    | 'csv'
    | 'json'
    | 'html'
    | 'doc'
    | 'docx'
    | 'xls'
    | 'xlsx'
    | 'ppt'
    | 'pptx';
  title?: string;
  content?: string;
  rows?: Array<Array<string | number | boolean | null>>;
  slides?: Array<{ title?: string; body?: string; bullets?: string[] }>;
  storeInVault?: boolean;
  tags?: string[];
}

interface ZipEntry {
  name: string;
  data: string | Buffer;
}

const OFFICE_DOCUMENT_FORMATS = new Set<DocumentFormat>(['docx', 'xlsx', 'pptx']);
const TEXT_DOCUMENT_FORMATS = new Set<DocumentFormat>(['txt', 'md', 'csv', 'json', 'html']);
const CRC32_TABLE = new Uint32Array(256);

for (let i = 0; i < CRC32_TABLE.length; i += 1) {
  let c = i;
  for (let j = 0; j < 8; j += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function normalizeDocumentFormat(rawFormat: CreateDocumentArgs['format'], requestedPath: string) {
  const source = (rawFormat ?? extname(requestedPath).slice(1) ?? '').toLowerCase();
  switch (source) {
    case '':
      return 'md';
    case 'markdown':
      return 'md';
    case 'doc':
      return 'docx';
    case 'xls':
      return 'xlsx';
    case 'ppt':
      return 'pptx';
    case 'txt':
    case 'md':
    case 'csv':
    case 'json':
    case 'html':
    case 'docx':
    case 'xlsx':
    case 'pptx':
      return source;
    default:
      throw new Error(`Unsupported document format: ${source}`);
  }
}

function normalizeDocumentPath(requestedPath: string, format: DocumentFormat): string {
  const currentExt = extname(requestedPath);
  if (!currentExt) return `${requestedPath}.${format}`;

  const current = currentExt.slice(1).toLowerCase();
  const shouldReplace =
    current === 'markdown' ||
    current === 'doc' ||
    current === 'xls' ||
    current === 'ppt' ||
    current !== format;

  return shouldReplace ? `${requestedPath.slice(0, -currentExt.length)}.${format}` : requestedPath;
}

function uniqueTags(input: string[] | undefined): string[] {
  const tags = ['agent-created', ...(input ?? [])]
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return [...new Set(tags)];
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function splitContentLines(content: string | undefined): string[] {
  if (!content || content.length === 0) return [];
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function buildTextDocument(format: DocumentFormat, args: CreateDocumentArgs): Buffer {
  const content = args.content ?? '';
  switch (format) {
    case 'txt':
      return Buffer.from(content, 'utf-8');
    case 'md': {
      const title = args.title?.trim();
      const body = content.trimStart();
      const markdown =
        title && !body.startsWith('#')
          ? `# ${title}\n\n${content}`
          : content || `# ${title ?? ''}\n`;
      return Buffer.from(markdown, 'utf-8');
    }
    case 'csv': {
      if (args.rows && args.rows.length > 0) {
        return Buffer.from(formatCsvRows(args.rows), 'utf-8');
      }
      return Buffer.from(content, 'utf-8');
    }
    case 'json': {
      if (content.trim().length > 0) {
        try {
          return Buffer.from(`${JSON.stringify(JSON.parse(content), null, 2)}\n`, 'utf-8');
        } catch (err) {
          throw new Error(
            `JSON document content must be valid JSON: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      return Buffer.from(
        `${JSON.stringify(
          {
            title: args.title ?? null,
            content: args.content ?? null,
            rows: args.rows ?? null,
            slides: args.slides ?? null,
          },
          null,
          2,
        )}\n`,
        'utf-8',
      );
    }
    case 'html': {
      if (/<html[\s>]/i.test(content) || /<!doctype html>/i.test(content)) {
        return Buffer.from(content, 'utf-8');
      }
      const title = args.title?.trim() || 'Team-X Document';
      const paragraphs = splitContentLines(content)
        .map((line) => (line.trim().length > 0 ? `<p>${escapeXml(line)}</p>` : '<p><br></p>'))
        .join('\n');
      return Buffer.from(
        [
          '<!doctype html>',
          '<html lang="en">',
          '<head>',
          '<meta charset="utf-8">',
          `<title>${escapeXml(title)}</title>`,
          '</head>',
          '<body>',
          `<h1>${escapeXml(title)}</h1>`,
          paragraphs,
          '</body>',
          '</html>',
          '',
        ].join('\n'),
        'utf-8',
      );
    }
    default:
      throw new Error(`Unsupported text document format: ${format}`);
  }
}

function formatCsvRows(rows: Array<Array<string | number | boolean | null>>): string {
  return `${rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n')}\n`;
}

function makeCoreProperties(title: string | undefined): string {
  const createdAt = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title ?? 'Team-X Document')}</dc:title>
  <dc:creator>Team-X Agent</dc:creator>
  <cp:lastModifiedBy>Team-X Agent</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`;
}

function makeAppProperties(application = 'Team-X'): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>${escapeXml(application)}</Application>
</Properties>`;
}

function buildDocxDocument(args: CreateDocumentArgs): Buffer {
  const title = args.title?.trim();
  const lines = splitContentLines(args.content);
  const paragraphs = [
    ...(title ? [wordParagraph(title, { bold: true, size: 32 })] : []),
    ...(lines.length > 0 ? lines.map((line) => wordParagraph(line)) : [wordParagraph('')]),
  ].join('');

  return createZip([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    { name: 'docProps/core.xml', data: makeCoreProperties(title) },
    { name: 'docProps/app.xml', data: makeAppProperties('Team-X') },
    {
      name: 'word/document.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`,
    },
  ]);
}

function wordParagraph(text: string, options: { bold?: boolean; size?: number } = {}): string {
  const rPr =
    options.bold || options.size
      ? `<w:rPr>${options.bold ? '<w:b/>' : ''}${options.size ? `<w:sz w:val="${options.size}"/>` : ''}</w:rPr>`
      : '';
  return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function buildXlsxDocument(args: CreateDocumentArgs): Buffer {
  const rows = normalizeSpreadsheetRows(args);
  const sheetRows = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((cell, cellIndex) => excelCell(cell, `${excelColumnName(cellIndex + 1)}${rowNumber}`))
        .join('');
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join('');

  return createZip([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    { name: 'docProps/core.xml', data: makeCoreProperties(args.title) },
    { name: 'docProps/app.xml', data: makeAppProperties('Team-X') },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`,
    },
  ]);
}

function normalizeSpreadsheetRows(
  args: CreateDocumentArgs,
): Array<Array<string | number | boolean | null>> {
  if (args.rows && args.rows.length > 0) return args.rows;
  const lines = splitContentLines(args.content).filter((line) => line.length > 0);
  if (lines.length > 0) {
    return lines.map((line) => line.split(line.includes('\t') ? '\t' : ','));
  }
  return [[args.title ?? 'Team-X Spreadsheet']];
}

function excelColumnName(index: number): string {
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function excelCell(value: string | number | boolean | null, ref: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value ?? '')}</t></is></c>`;
}

function buildPptxDocument(args: CreateDocumentArgs): Buffer {
  const slides = normalizeSlides(args);
  const slideOverrides = slides
    .map(
      (_slide, index) =>
        `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join('\n  ');
  const presentationSlideIds = slides
    .map((_slide, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`)
    .join('');
  const presentationRels = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
    ...slides.map(
      (_slide, index) =>
        `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`,
    ),
  ].join('\n  ');

  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideOverrides}
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    { name: 'docProps/core.xml', data: makeCoreProperties(args.title) },
    { name: 'docProps/app.xml', data: makeAppProperties('Team-X') },
    {
      name: 'ppt/presentation.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${presentationSlideIds}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`,
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${presentationRels}
</Relationships>`,
    },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: makeSlideMasterXml() },
    {
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`,
    },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: makeSlideLayoutXml() },
    {
      name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
    },
    { name: 'ppt/theme/theme1.xml', data: makeThemeXml() },
    ...slides.flatMap((slide, index) => [
      { name: `ppt/slides/slide${index + 1}.xml`, data: makeSlideXml(slide) },
      {
        name: `ppt/slides/_rels/slide${index + 1}.xml.rels`,
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,
      },
    ]),
  ];

  return createZip(entries);
}

function normalizeSlides(
  args: CreateDocumentArgs,
): Array<{ title?: string; body?: string; bullets?: string[] }> {
  if (args.slides && args.slides.length > 0) return args.slides;
  const lines = splitContentLines(args.content).filter((line) => line.trim().length > 0);
  return [
    {
      title: args.title ?? lines[0] ?? 'Team-X Presentation',
      body: lines.slice(args.title ? 0 : 1).join('\n'),
    },
  ];
}

function makeSlideXml(slide: { title?: string; body?: string; bullets?: string[] }): string {
  const bodyLines = [
    ...splitContentLines(slide.body).filter((line) => line.trim().length > 0),
    ...(slide.bullets ?? []),
  ];
  const bodyParagraphs =
    bodyLines.length > 0
      ? bodyLines.map((line) => pptParagraph(line, slide.bullets?.includes(line))).join('')
      : pptParagraph('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${pptTextShape(2, 'Title', slide.title ?? 'Team-X Presentation', 685800, 457200, 10820400, 914400, 3600, true)}
      ${pptTextShape(3, 'Content', bodyParagraphs, 914400, 1828800, 10363200, 4114800, 2400, false, true)}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function pptTextShape(
  id: number,
  name: string,
  content: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  fontSize: number,
  bold: boolean,
  contentIsXml = false,
): string {
  const paragraphs = contentIsXml
    ? content
    : `<a:p><a:r><a:rPr lang="en-US" sz="${fontSize}"${bold ? ' b="1"' : ''}/><a:t>${escapeXml(content)}</a:t></a:r></a:p>`;
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
  <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphs}</p:txBody>
</p:sp>`;
}

function pptParagraph(text: string, bullet = false): string {
  return `<a:p>${bullet ? '<a:pPr marL="342900" indent="-171450"><a:buChar char="•"/></a:pPr>' : ''}<a:r><a:rPr lang="en-US" sz="2400"/><a:t>${escapeXml(text)}</a:t></a:r></a:p>`;
}

function makeSlideMasterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`;
}

function makeSlideLayoutXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;
}

function makeThemeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Team-X">
  <a:themeElements>
    <a:clrScheme name="Team-X">
      <a:dk1><a:srgbClr val="111827"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F9FAFB"/></a:lt2>
      <a:accent1><a:srgbClr val="DC2626"/></a:accent1><a:accent2><a:srgbClr val="2563EB"/></a:accent2>
      <a:accent3><a:srgbClr val="059669"/></a:accent3><a:accent4><a:srgbClr val="D97706"/></a:accent4>
      <a:accent5><a:srgbClr val="7C3AED"/></a:accent5><a:accent6><a:srgbClr val="0891B2"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Team-X"><a:majorFont><a:latin typeface="Aptos Display"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="Team-X"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>`;
}

function buildDocumentBuffer(format: DocumentFormat, args: CreateDocumentArgs): Buffer {
  if (TEXT_DOCUMENT_FORMATS.has(format)) return buildTextDocument(format, args);
  switch (format) {
    case 'docx':
      return buildDocxDocument(args);
    case 'xlsx':
      return buildXlsxDocument(args);
    case 'pptx':
      return buildPptxDocument(args);
    default:
      throw new Error(`Unsupported document format: ${format}`);
  }
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    const tableValue = CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0;
    crc = tableValue ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function createZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const stamped = dosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf-8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf-8');
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(stamped.time, 10);
    localHeader.writeUInt16LE(stamped.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(stamped.time, 12);
    centralHeader.writeUInt16LE(stamped.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralStart = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildCreateDocumentTool(deps: ExecutionToolDeps): ToolSpec {
  return {
    name: 'create_document',
    description:
      'Create a durable deliverable file in your workspace. Supports txt, md, csv, json, html, docx, xlsx, and pptx. ' +
      'Legacy doc/xls/ppt requests are normalized to docx/xlsx/pptx. When vault storage is available, the file is also added to Files and Artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Relative output path within your workspace. Extension is added or normalized to match the selected format.',
        },
        format: {
          type: 'string',
          enum: [
            'txt',
            'md',
            'markdown',
            'csv',
            'json',
            'html',
            'doc',
            'docx',
            'xls',
            'xlsx',
            'ppt',
            'pptx',
          ],
          description: 'Output format. Defaults to the path extension, or markdown when omitted.',
        },
        title: {
          type: 'string',
          description: 'Optional document title.',
        },
        content: {
          type: 'string',
          description: 'Primary document content.',
        },
        rows: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: ['string', 'number', 'boolean', 'null'] },
          },
          description: 'Spreadsheet rows for csv/xlsx outputs.',
        },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              body: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
          },
          description: 'Slides for pptx outputs.',
        },
        storeInVault: {
          type: 'boolean',
          description:
            'Whether to store the generated file in the company vault. Defaults to true.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional vault tags. The agent-created tag is always added.',
        },
      },
      required: ['path'],
    },
    execute: (async (rawArgs: unknown): Promise<unknown> => {
      const args = rawArgs as CreateDocumentArgs;
      if (typeof args.path !== 'string' || args.path.trim().length === 0) {
        return { success: false, error: 'Missing "path" for document creation.' };
      }

      const format = normalizeDocumentFormat(args.format, args.path);
      const outputPath = normalizeDocumentPath(args.path.trim(), format);
      const workspaceRoot = getWorkspaceRoot(deps);
      await ensureWorkspace(workspaceRoot);

      const { safePath, relativePath } = resolveWorkspacePath(outputPath, workspaceRoot);
      const bytes = buildDocumentBuffer(format, args);

      try {
        await mkdir(dirname(safePath), { recursive: true });
        await writeFile(safePath, bytes);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      const fileStat = await stat(safePath);
      let vaultFileId: string | null = null;
      let vaultError: string | null = null;
      const canStoreInVault = deps.vault && deps.companyId && args.storeInVault !== false;

      if (canStoreInVault && deps.vault && deps.companyId) {
        try {
          vaultFileId = await deps.vault.store(
            deps.companyId,
            safePath,
            deps.employeeId,
            uniqueTags(args.tags),
            'employee',
          );
        } catch (err) {
          vaultError = err instanceof Error ? err.message : String(err);
        }
      }

      return {
        success: true,
        path: relativePath,
        format,
        bytes: fileStat.size,
        storedInVault: vaultFileId !== null,
        vaultFileId,
        vaultError,
        message: OFFICE_DOCUMENT_FORMATS.has(format)
          ? `Created ${format.toUpperCase()} document at ${relativePath}.`
          : `Created ${format.toUpperCase()} file at ${relativePath}.`,
      };
    }) as ToolSpec['execute'],
  };
}

// ---------------------------------------------------------------------------
// shell — execute commands within the workspace
// ---------------------------------------------------------------------------

interface ShellArgs {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}

function buildShellTool(deps: ExecutionToolDeps): ToolSpec {
  return {
    name: 'shell',
    description:
      'Execute a shell command within your workspace. Returns stdout, stderr, ' +
      'and exit code. Use this to run tests, build, install dependencies, ' +
      'or invoke build scripts. Commands run inside your isolated workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute (e.g. "npm", "git", "python").',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Command arguments.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory relative to your workspace.',
        },
        timeoutMs: {
          type: 'number',
          description: 'Max execution time in milliseconds (default 30000).',
        },
      },
      required: ['command'],
    },
    execute: (async (rawArgs: unknown): Promise<unknown> => {
      const args = rawArgs as ShellArgs;
      const workspaceRoot = getWorkspaceRoot(deps);
      await ensureWorkspace(workspaceRoot);

      const cwd = args.cwd ? resolveWorkspacePath(args.cwd, workspaceRoot).safePath : workspaceRoot;

      const timeout = args.timeoutMs ?? 30_000;

      try {
        const { stdout, stderr } = await execFileAsync(args.command, args.args ?? [], {
          cwd,
          timeout,
          shell: false,
          windowsHide: true,
        });
        return {
          success: true,
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 10_000),
          exitCode: 0,
        };
      } catch (err) {
        if (err && typeof err === 'object' && 'stdout' in err) {
          const execErr = err as { stdout: string; stderr: string; code: number | null };
          return {
            success: false,
            stdout: execErr.stdout.slice(0, 50_000),
            stderr: execErr.stderr.slice(0, 10_000),
            exitCode: execErr.code ?? 1,
            error: `Command exited with code ${execErr.code ?? 1}`,
          };
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }) as ToolSpec['execute'],
  };
}

// ---------------------------------------------------------------------------
// git — run git commands within the workspace
// ---------------------------------------------------------------------------

interface GitArgs {
  subcommand: string;
  args?: string[];
  cwd?: string;
}

function buildGitTool(deps: ExecutionToolDeps): ToolSpec {
  return {
    name: 'git',
    description:
      'Run git commands within your workspace. Common subcommands: status, log, ' +
      'diff, branch, checkout, commit, push, pull, clone, init. ' +
      'Returns stdout/stderr from git.',
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: {
          type: 'string',
          description: 'The git subcommand (e.g. "status", "commit", "push").',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional arguments for the subcommand.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory relative to your workspace.',
        },
      },
      required: ['subcommand'],
    },
    execute: (async (rawArgs: unknown): Promise<unknown> => {
      const args = rawArgs as GitArgs;
      const workspaceRoot = getWorkspaceRoot(deps);
      await ensureWorkspace(workspaceRoot);

      const cwd = args.cwd ? resolveWorkspacePath(args.cwd, workspaceRoot).safePath : workspaceRoot;

      try {
        const { stdout, stderr } = await execFileAsync(
          'git',
          [args.subcommand, ...(args.args ?? [])],
          {
            cwd,
            timeout: 30_000,
            shell: false,
            windowsHide: true,
          },
        );
        return {
          success: true,
          stdout: stdout.slice(0, 50_000),
          stderr: stderr.slice(0, 10_000),
          exitCode: 0,
        };
      } catch (err) {
        if (err && typeof err === 'object' && 'stdout' in err) {
          const execErr = err as { stdout: string; stderr: string; code: number | null };
          return {
            success: false,
            stdout: execErr.stdout.slice(0, 50_000),
            stderr: execErr.stderr.slice(0, 10_000),
            exitCode: execErr.code ?? 1,
            error: `git exited with code ${execErr.code ?? 1}`,
          };
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }) as ToolSpec['execute'],
  };
}

// ---------------------------------------------------------------------------
// browse — fetch web pages
// ---------------------------------------------------------------------------

interface BrowseArgs {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}

function buildBrowseTool(): ToolSpec {
  return {
    name: 'browse',
    description:
      'Fetch a web page or API endpoint. Returns status, headers, and body text. ' +
      'Use this to read documentation, check APIs, or research solutions. ' +
      'Max response size: 500 KB.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch.',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method (default GET).',
        },
        headers: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Optional request headers.',
        },
        body: {
          type: 'string',
          description: 'Request body (for POST/PUT).',
        },
      },
      required: ['url'],
    },
    execute: (async (rawArgs: unknown): Promise<unknown> => {
      const args = rawArgs as BrowseArgs;
      const maxSize = 500_000;

      try {
        const response = await fetch(args.url, {
          method: args.method ?? 'GET',
          headers: args.headers,
          body: args.body,
          redirect: 'follow',
        });

        const contentType = response.headers.get('content-type') ?? '';
        let bodyText: string;

        if (contentType.includes('application/json')) {
          const json = await response.json();
          bodyText = JSON.stringify(json, null, 2);
        } else {
          bodyText = await response.text();
        }

        if (bodyText.length > maxSize) {
          bodyText = `${bodyText.slice(0, maxSize)}\n... [truncated]`;
        }

        return {
          success: true,
          status: response.status,
          statusText: response.statusText,
          contentType,
          body: bodyText,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }) as ToolSpec['execute'],
  };
}

// ---------------------------------------------------------------------------
// Composer — build all execution tools for an employee
// ---------------------------------------------------------------------------

export function buildExecutionTools(deps: ExecutionToolDeps): ToolSpec[] {
  return [
    buildFilesystemTool(deps),
    buildCreateDocumentTool(deps),
    buildShellTool(deps),
    buildGitTool(deps),
    buildBrowseTool(),
  ];
}
