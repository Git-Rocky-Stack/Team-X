/**
 * Built-in MCP templates that ship with Team-X.
 *
 * These are pre-configured MCP servers that provide immediate value to users.
 * Each template includes metadata, configuration, and usage information.
 */

export interface BuiltInMcpTemplate {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  category: McpCategory;
  transport: 'stdio' | 'sse';
  command: string;
  args: string[];
  env?: Record<string, string>;
  configJson: string;
  toolCount: number;
  capabilities: string[];
  enabledByDefault: boolean;
  requiresApiKey: boolean;
  apiKeyName?: string;
  autoConfigure: boolean;
  popular?: boolean;
  new?: boolean;
  healthCheck?: string;
}

export type McpCategory =
  | 'files'
  | 'development'
  | 'data'
  | 'network'
  | 'utility'
  | 'database'
  | 'integration'
  | 'ai';

/**
 * Core MCP templates that ship with Team-X.
 * These provide immediate value and cover the most common use cases.
 */
export const BUILT_IN_MCP_TEMPLATES: BuiltInMcpTemplate[] = [
  {
    id: 'filesystem-local',
    name: 'Filesystem (Local)',
    description: 'Access local files and directories with safety limits',
    longDescription:
      'Core filesystem access for reading, writing, and organizing files. Automatically configured with safe default paths for your operating system. Perfect for document processing, data analysis, and file management.',
    category: 'files',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\AllowedPath'],
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\AllowedPath'],
    }),
    toolCount: 8,
    capabilities: ['filesystem.read', 'filesystem.write'],
    enabledByDefault: true,
    requiresApiKey: false,
    autoConfigure: true,
    popular: true,
    healthCheck: 'ready',
  },
  {
    id: 'git-operations',
    name: 'Git Operations',
    description: 'Read git repositories and perform version control operations',
    longDescription:
      'Version control capabilities for Git repositories. Agents can read repository history, check file status, create commits, manage branches, and perform common Git operations safely.',
    category: 'development',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git'],
    }),
    toolCount: 12,
    capabilities: ['filesystem.read', 'process.spawn'],
    enabledByDefault: true,
    requiresApiKey: false,
    autoConfigure: false,
    popular: true,
    healthCheck: 'ready',
  },
  {
    id: 'persistent-memory',
    name: 'Persistent Memory',
    description: 'Remember information across sessions and conversations',
    longDescription:
      'Long-term memory capability that allows agents to remember important information across conversations. Perfect for maintaining context, preferences, and important details over time.',
    category: 'utility',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    }),
    toolCount: 6,
    capabilities: [],
    enabledByDefault: true,
    requiresApiKey: false,
    autoConfigure: false,
    popular: true,
    healthCheck: 'ready',
  },
  {
    id: 'brave-search',
    name: 'Brave Web Search',
    description: 'Search the web using Brave Search API',
    longDescription:
      'Real-time web search capabilities using Brave Search API. Agents can search for current information, fact-check claims, and gather up-to-date data from the web.',
    category: 'network',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: '' },
    }),
    toolCount: 3,
    capabilities: ['network'],
    enabledByDefault: false,
    requiresApiKey: true,
    apiKeyName: 'BRAVE_API_KEY',
    autoConfigure: false,
    popular: true,
    healthCheck: 'needs_api_key',
  },
  {
    id: 'postgres-database',
    name: 'PostgreSQL Database',
    description: 'Connect and query PostgreSQL databases safely',
    longDescription:
      'Database connectivity for PostgreSQL. Agents can run queries, analyze data, and help with database operations. Perfect for data analysis, reporting, and database management tasks.',
    category: 'database',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://'],
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://'],
    }),
    toolCount: 5,
    capabilities: ['network'],
    enabledByDefault: false,
    requiresApiKey: false,
    autoConfigure: false,
    healthCheck: 'needs_connection',
  },
  {
    id: 'sqlite-database',
    name: 'SQLite Database',
    description: 'Query and manage SQLite database files',
    longDescription:
      'SQLite database support for working with local database files. Agents can run queries, create tables, analyze data, and help with database operations on SQLite files.',
    category: 'database',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './database.db'],
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './database.db'],
    }),
    toolCount: 7,
    capabilities: ['filesystem.read', 'filesystem.write'],
    enabledByDefault: false,
    requiresApiKey: false,
    autoConfigure: false,
    healthCheck: 'ready',
  },
  {
    id: 'github',
    name: 'GitHub Integration',
    description: 'Interact with GitHub repositories and operations',
    longDescription:
      'GitHub integration for managing repositories, issues, pull requests, and more. Agents can help with repository management, code review, and GitHub automation.',
    category: 'integration',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_TOKEN: '' },
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: '' },
    }),
    toolCount: 15,
    capabilities: ['network'],
    enabledByDefault: false,
    requiresApiKey: true,
    apiKeyName: 'GITHUB_TOKEN',
    autoConfigure: false,
    popular: true,
    healthCheck: 'needs_api_key',
  },
  {
    id: 'slack',
    name: 'Slack Integration',
    description: 'Send messages and interact with Slack workspaces',
    longDescription:
      'Slack integration for sending messages, managing channels, and workspace automation. Agents can help with team communication, notifications, and Slack workflows.',
    category: 'integration',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: { SLACK_TOKEN: '' },
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      env: { SLACK_TOKEN: '' },
    }),
    toolCount: 8,
    capabilities: ['network'],
    enabledByDefault: false,
    requiresApiKey: true,
    apiKeyName: 'SLACK_TOKEN',
    autoConfigure: false,
    healthCheck: 'needs_api_key',
  },
  {
    id: 'exa-search',
    name: 'Exa AI Search',
    description: 'AI-powered web search with Exa API',
    longDescription:
      'Advanced AI-powered web search using Exa API. Provides intelligent search results with better understanding of queries and more relevant results than traditional search.',
    category: 'ai',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-exa'],
    env: { EXA_API_KEY: '' },
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-exa'],
      env: { EXA_API_KEY: '' },
    }),
    toolCount: 4,
    capabilities: ['network'],
    enabledByDefault: false,
    requiresApiKey: true,
    apiKeyName: 'EXA_API_KEY',
    autoConfigure: false,
    new: true,
    healthCheck: 'needs_api_key',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer Web Automation',
    description: 'Automate web browsers and scrape web pages',
    longDescription:
      'Browser automation using Puppeteer. Agents can navigate websites, fill forms, take screenshots, scrape data, and automate repetitive web tasks.',
    category: 'integration',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    }),
    toolCount: 10,
    capabilities: ['network', 'process.spawn'],
    enabledByDefault: false,
    requiresApiKey: false,
    autoConfigure: false,
    healthCheck: 'ready',
  },
  {
    id: 'fetch',
    name: 'Fetch & HTTP Client',
    description: 'Make HTTP requests and fetch web content',
    longDescription:
      'Simple HTTP client for making web requests and fetching content. Agents can retrieve web pages, call APIs, test endpoints, and integrate with web services.',
    category: 'network',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    }),
    toolCount: 3,
    capabilities: ['network'],
    enabledByDefault: true,
    requiresApiKey: false,
    autoConfigure: false,
    popular: true,
    healthCheck: 'ready',
  },
  {
    id: 'google-maps',
    name: 'Google Maps Integration',
    description: 'Location search, maps, and geographical data',
    longDescription:
      'Google Maps integration for location search, maps, directions, and geographical data. Agents can help with location-based queries, mapping, and geographic information.',
    category: 'integration',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps'],
    env: { GOOGLE_MAPS_API_KEY: '' },
    configJson: JSON.stringify({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-google-maps'],
      env: { GOOGLE_MAPS_API_KEY: '' },
    }),
    toolCount: 6,
    capabilities: ['network'],
    enabledByDefault: false,
    requiresApiKey: true,
    apiKeyName: 'GOOGLE_MAPS_API_KEY',
    autoConfigure: false,
    healthCheck: 'needs_api_key',
  },
];

/**
 * Get template by ID
 */
export function getMcpTemplateById(id: string): BuiltInMcpTemplate | undefined {
  return BUILT_IN_MCP_TEMPLATES.find((template) => template.id === id);
}

/**
 * Get templates by category
 */
export function getMcpTemplatesByCategory(category: McpCategory): BuiltInMcpTemplate[] {
  return BUILT_IN_MCP_TEMPLATES.filter((template) => template.category === category);
}

/**
 * Get popular templates
 */
export function getPopularMcpTemplates(): BuiltInMcpTemplate[] {
  return BUILT_IN_MCP_TEMPLATES.filter((template) => template.popular);
}

/**
 * Get new templates
 */
export function getNewMcpTemplates(): BuiltInMcpTemplate[] {
  return BUILT_IN_MCP_TEMPLATES.filter((template) => template.new);
}

/**
 * Get enabled by default templates
 */
export function getDefaultEnabledMcpTemplates(): BuiltInMcpTemplate[] {
  return BUILT_IN_MCP_TEMPLATES.filter((template) => template.enabledByDefault);
}

/**
 * Get all categories
 */
export function getMcpCategories(): McpCategory[] {
  return Array.from(new Set(BUILT_IN_MCP_TEMPLATES.map((template) => template.category)));
}

/**
 * Auto-configure filesystem MCP for the current OS
 */
export function autoConfigureFilesystemMcp(): BuiltInMcpTemplate {
  const template = getMcpTemplateById('filesystem-local');
  if (!template) {
    throw new Error('Built-in filesystem MCP template is missing');
  }
  const os = process.platform || 'unknown';
  let allowedPath = '';

  // Set safe default paths based on OS
  switch (os) {
    case 'win32':
      allowedPath = `${process.env.USERPROFILE}\\Documents`;
      break;
    case 'darwin':
      allowedPath = `${process.env.HOME}/Documents`;
      break;
    case 'linux':
      allowedPath = `${process.env.HOME}/Documents`;
      break;
    default:
      allowedPath = process.cwd();
  }

  // Update the args with the OS-specific path
  const updatedArgs = ['-y', '@modelcontextprotocol/server-filesystem', allowedPath];
  const updatedConfig = JSON.stringify({
    command: template.command,
    args: updatedArgs,
  });

  return {
    ...template,
    args: updatedArgs,
    configJson: updatedConfig,
  };
}

/**
 * Category display names and descriptions
 */
export const MCP_CATEGORY_INFO: Record<
  McpCategory,
  { name: string; description: string; icon: string }
> = {
  files: {
    name: 'Files',
    description: 'File system and document operations',
    icon: 'folder',
  },
  development: {
    name: 'Development',
    description: 'Code and version control tools',
    icon: 'code',
  },
  data: {
    name: 'Data',
    description: 'Database and data processing',
    icon: 'database',
  },
  network: {
    name: 'Network',
    description: 'Web and network operations',
    icon: 'globe',
  },
  utility: {
    name: 'Utility',
    description: 'General purpose helpers',
    icon: 'wrench',
  },
  database: {
    name: 'Database',
    description: 'Database connections and queries',
    icon: 'database',
  },
  integration: {
    name: 'Integration',
    description: 'Third-party service integrations',
    icon: 'link',
  },
  ai: {
    name: 'AI & ML',
    description: 'AI and machine learning tools',
    icon: 'brain',
  },
};
