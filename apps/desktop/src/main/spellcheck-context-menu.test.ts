import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';

import {
  type SpellcheckContextMenuParams,
  buildSpellcheckContextMenuTemplate,
} from './spellcheck-context-menu-template.js';

const currentDirname = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(currentDirname, 'index.ts'), 'utf8');
const bridgeSrc = readFileSync(join(currentDirname, 'spellcheck-context-menu.ts'), 'utf8');

function params(overrides: Partial<SpellcheckContextMenuParams> = {}): SpellcheckContextMenuParams {
  return {
    isEditable: true,
    selectionText: '',
    misspelledWord: '',
    dictionarySuggestions: [],
    spellcheckEnabled: true,
    editFlags: {
      canUndo: false,
      canRedo: false,
      canCut: false,
      canCopy: false,
      canPaste: true,
      canDelete: false,
      canSelectAll: true,
    },
    ...overrides,
  };
}

function click(item: MenuItemConstructorOptions): void {
  item.click?.({} as never, undefined, {} as never);
}

describe('spellcheck context menu template', () => {
  it('offers spelling replacements and dictionary insertion for misspelled editable text', () => {
    const replaced: string[] = [];
    const added: string[] = [];
    const template = buildSpellcheckContextMenuTemplate(
      params({
        misspelledWord: 'recieve',
        dictionarySuggestions: ['receive', 'receiver', ' receive ', 'recieve'],
      }),
      {
        replaceMisspelling: (suggestion) => replaced.push(suggestion),
        addWordToDictionary: (word) => added.push(word),
      },
    );

    expect(template.map((item) => item.label ?? item.type)).toEqual([
      'receive',
      'receiver',
      'Add "recieve" to Dictionary',
      'separator',
      'Undo',
      'Redo',
      'separator',
      'Cut',
      'Copy',
      'Paste',
      'Delete',
      'separator',
      'Select All',
    ]);

    const receiveItem = template.find((item) => item.label === 'receive');
    const addWordItem = template.find((item) => item.label === 'Add "recieve" to Dictionary');
    expect(receiveItem).toBeDefined();
    expect(addWordItem).toBeDefined();
    click(receiveItem as MenuItemConstructorOptions);
    click(addWordItem as MenuItemConstructorOptions);

    expect(replaced).toEqual(['receive']);
    expect(added).toEqual(['recieve']);
  });

  it('keeps edit roles available even when Chromium has no suggestions', () => {
    const template = buildSpellcheckContextMenuTemplate(
      params({
        misspelledWord: 'zzzzstrategia',
        dictionarySuggestions: [],
        editFlags: {
          canUndo: true,
          canRedo: false,
          canCut: true,
          canCopy: true,
          canPaste: false,
          canDelete: true,
          canSelectAll: true,
        },
      }),
      {
        replaceMisspelling: () => undefined,
        addWordToDictionary: () => undefined,
      },
    );

    expect(template[0]).toMatchObject({ label: 'No spelling suggestions', enabled: false });
    expect(template.find((item) => item.role === 'cut')).toMatchObject({ enabled: true });
    expect(template.find((item) => item.role === 'paste')).toMatchObject({ enabled: false });
    expect(template.find((item) => item.role === 'selectAll')).toMatchObject({ enabled: true });
  });

  it('only shows copy for selected read-only text and stays silent otherwise', () => {
    const actions = {
      replaceMisspelling: () => undefined,
      addWordToDictionary: () => undefined,
    };
    expect(
      buildSpellcheckContextMenuTemplate(
        params({ isEditable: false, selectionText: 'selected', editFlags: params().editFlags }),
        actions,
      ),
    ).toEqual([{ role: 'copy', label: 'Copy', enabled: false }]);

    expect(
      buildSpellcheckContextMenuTemplate(params({ isEditable: false, selectionText: '' }), actions),
    ).toEqual([]);
  });
});

describe('spellcheck context menu wiring', () => {
  it('enables Chromium spellcheck and attaches the native context-menu bridge', () => {
    expect(indexSrc).toContain(
      "import { attachSpellcheckContextMenu } from './spellcheck-context-menu.js';",
    );
    expect(indexSrc).toContain('spellcheck: true');
    expect(indexSrc).toContain('attachSpellcheckContextMenu(win);');
    expect(bridgeSrc).toContain("win.webContents.on('context-menu'");
    expect(bridgeSrc).toContain('win.webContents.replaceMisspelling(suggestion)');
    expect(bridgeSrc).toContain('addWordToSpellCheckerDictionary(word)');
    expect(bridgeSrc).toContain('Menu.buildFromTemplate(template).popup({ window: win });');
  });
});
