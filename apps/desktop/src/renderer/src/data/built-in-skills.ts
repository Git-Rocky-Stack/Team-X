/**
 * Built-in skills that ship with Team-X.
 *
 * These are pre-installed capabilities that provide immediate value to users.
 * Each skill includes metadata, tools, capabilities, and usage information.
 */

export interface BuiltInSkill {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  category: SkillCategory;
  icon: string;
  tools: string[];
  capabilities: string[];
  enabledByDefault: boolean;
  requiresApiKey: boolean;
  apiKeyName?: string;
  popular?: boolean;
  new?: boolean;
}

export type SkillCategory =
  | 'research'
  | 'files'
  | 'data'
  | 'development'
  | 'communication'
  | 'productivity'
  | 'utility'
  | 'integration';

/**
 * Core skills that ship with Team-X.
 * These provide immediate value and cover the most common use cases.
 */
export const BUILT_IN_SKILLS: BuiltInSkill[] = [
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web and retrieve current information',
    longDescription:
      'Enables agents to search the web for real-time information, fact-check claims, and gather current data. Perfect for research, competitive analysis, and staying up-to-date.',
    category: 'research',
    icon: 'globe',
    tools: ['search_web', 'fetch_url', 'summarize_page', 'extract_content'],
    capabilities: ['network'],
    enabledByDefault: true,
    requiresApiKey: true,
    apiKeyName: 'BRAVE_API_KEY',
    popular: true,
  },
  {
    id: 'file-operations',
    name: 'File Operations',
    description: 'Read, write, search, and manipulate files',
    longDescription:
      'Core file system capabilities including reading, writing, searching, and organizing files. Agents can create documents, organize folders, and manage file structures safely.',
    category: 'files',
    icon: 'file-text',
    tools: [
      'read_file',
      'write_file',
      'create_directory',
      'search_files',
      'list_directory',
      'move_file',
      'copy_file',
      'delete_file',
    ],
    capabilities: ['filesystem.read', 'filesystem.write'],
    enabledByDefault: true,
    requiresApiKey: false,
    popular: true,
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: 'Analyze CSV/JSON data and generate insights',
    longDescription:
      'Powerful data analysis capabilities for working with CSV, JSON, and structured data. Agents can perform statistical analysis, create visualizations, and extract meaningful insights from datasets.',
    category: 'data',
    icon: 'bar-chart',
    tools: [
      'analyze_csv',
      'query_json',
      'aggregate_data',
      'find_patterns',
      'generate_chart',
      'export_report',
    ],
    capabilities: ['filesystem.read'],
    enabledByDefault: true,
    requiresApiKey: false,
    popular: true,
  },
  {
    id: 'code-execution',
    name: 'Code Execution',
    description: 'Execute Python and JavaScript code safely',
    longDescription:
      'Sandboxed code execution environment for running Python and JavaScript. Agents can perform computations, test algorithms, and execute data processing tasks safely.',
    category: 'development',
    icon: 'code',
    tools: ['execute_python', 'execute_javascript', 'test_code', 'debug_code'],
    capabilities: ['process.spawn'],
    enabledByDefault: false,
    requiresApiKey: false,
  },
  {
    id: 'email-helper',
    name: 'Email Helper',
    description: 'Draft, format, and manage email communications',
    longDescription:
      'Professional email assistance including drafting, formatting, proofreading, and organizing email communications. Agents can help write compelling emails and manage templates.',
    category: 'communication',
    icon: 'mail',
    tools: [
      'draft_email',
      'format_email',
      'proofread_text',
      'create_template',
      'manage_signatures',
    ],
    capabilities: [],
    enabledByDefault: true,
    requiresApiKey: false,
    popular: true,
  },
  {
    id: 'scheduling',
    name: 'Scheduling & Calendar',
    description: 'Manage events, deadlines, and time coordination',
    longDescription:
      'Calendar and scheduling capabilities for managing events, deadlines, appointments, and time coordination. Agents can help organize schedules and send reminders.',
    category: 'productivity',
    icon: 'calendar',
    tools: [
      'create_event',
      'check_availability',
      'find_meeting_time',
      'send_reminder',
      'manage_deadlines',
    ],
    capabilities: [],
    enabledByDefault: true,
    requiresApiKey: false,
  },
  {
    id: 'task-management',
    name: 'Task Management',
    description: 'Create, organize, and track tasks and projects',
    longDescription:
      'Comprehensive task management including creating tasks, setting priorities, tracking progress, and organizing projects. Perfect for project management and personal productivity.',
    category: 'productivity',
    icon: 'check-square',
    tools: [
      'create_task',
      'update_task',
      'list_tasks',
      'assign_task',
      'set_priorities',
      'track_progress',
    ],
    capabilities: [],
    enabledByDefault: true,
    requiresApiKey: false,
    popular: true,
  },
  {
    id: 'web-automation',
    name: 'Web Automation',
    description: 'Automate web interactions and data extraction',
    longDescription:
      'Browser automation for interacting with websites, filling forms, extracting data, and automating repetitive web tasks. Agents can navigate websites and perform actions.',
    category: 'integration',
    icon: 'globe',
    tools: ['navigate_web', 'fill_form', 'extract_data', 'take_screenshot', 'automate_workflow'],
    capabilities: ['network'],
    enabledByDefault: false,
    requiresApiKey: false,
  },
  {
    id: 'database-connector',
    name: 'Database Connector',
    description: 'Connect and query PostgreSQL and MySQL databases',
    longDescription:
      'Database connectivity for PostgreSQL and MySQL. Agents can run queries, analyze data, and help with database operations safely and efficiently.',
    category: 'data',
    icon: 'database',
    tools: ['connect_database', 'run_query', 'analyze_results', 'export_data', 'validate_schema'],
    capabilities: ['network'],
    enabledByDefault: false,
    requiresApiKey: false,
  },
  {
    id: 'api-client',
    name: 'API Client',
    description: 'Make HTTP requests and integrate with external APIs',
    longDescription:
      'HTTP client capabilities for making API requests, testing endpoints, and integrating with external services. Agents can help debug APIs and automate integrations.',
    category: 'integration',
    icon: 'zap',
    tools: ['make_request', 'test_endpoint', 'parse_response', 'handle_auth', 'debug_api'],
    capabilities: ['network'],
    enabledByDefault: true,
    requiresApiKey: false,
    new: true,
  },
  {
    id: 'document-processor',
    name: 'Document Processor',
    description: 'Process PDFs, Word docs, and other file formats',
    longDescription:
      'Document processing capabilities for working with PDFs, Word documents, and other file formats. Agents can extract text, analyze content, and convert formats.',
    category: 'utility',
    icon: 'file-text',
    tools: [
      'extract_text',
      'analyze_document',
      'convert_format',
      'merge_documents',
      'compress_files',
    ],
    capabilities: ['filesystem.read'],
    enabledByDefault: true,
    requiresApiKey: false,
  },
  {
    id: 'image-tools',
    name: 'Image Tools',
    description: 'Process, analyze, and manipulate images',
    longDescription:
      'Image processing capabilities including resizing, cropping, format conversion, and basic analysis. Agents can help organize and process image files.',
    category: 'utility',
    icon: 'image',
    tools: ['resize_image', 'crop_image', 'convert_format', 'extract_metadata', 'optimize_image'],
    capabilities: ['filesystem.read', 'filesystem.write'],
    enabledByDefault: false,
    requiresApiKey: false,
  },
  {
    id: 'git-helper',
    name: 'Git Helper',
    description: 'Git operations and version control assistance',
    longDescription:
      'Git version control capabilities including status checks, commit management, branch operations, and repository management. Agents can help with Git workflows.',
    category: 'development',
    icon: 'git-branch',
    tools: ['git_status', 'git_commit', 'git_branch', 'git_merge', 'git_log', 'resolve_conflicts'],
    capabilities: ['process.spawn'],
    enabledByDefault: false,
    requiresApiKey: false,
  },
  {
    id: 'note-taking',
    name: 'Note Taking',
    description: 'Create, organize, and search notes',
    longDescription:
      'Note-taking and knowledge management capabilities. Agents can help create structured notes, organize information, and search through notes efficiently.',
    category: 'productivity',
    icon: 'sticky-note',
    tools: ['create_note', 'organize_notes', 'search_notes', 'tag_content', 'format_text'],
    capabilities: ['filesystem.read', 'filesystem.write'],
    enabledByDefault: true,
    requiresApiKey: false,
  },
  {
    id: 'spreadsheet-tools',
    name: 'Spreadsheet Tools',
    description: 'Work with Excel and CSV spreadsheet files',
    longDescription:
      'Spreadsheet capabilities for working with Excel files and CSV data. Agents can help analyze data, create formulas, generate charts, and format spreadsheets.',
    category: 'data',
    icon: 'table',
    tools: [
      'read_excel',
      'write_excel',
      'apply_formula',
      'create_pivot',
      'generate_chart',
      'format_cells',
    ],
    capabilities: ['filesystem.read', 'filesystem.write'],
    enabledByDefault: true,
    requiresApiKey: false,
    popular: true,
  },
  {
    id: 'text-processor',
    name: 'Text Processor',
    description: 'Advanced text analysis and natural language processing',
    longDescription:
      'Advanced text processing including sentiment analysis, entity extraction, summarization, and natural language understanding. Agents can analyze and process text at scale.',
    category: 'utility',
    icon: 'type',
    tools: [
      'analyze_sentiment',
      'extract_entities',
      'summarize_text',
      'translate_text',
      'detect_language',
    ],
    capabilities: [],
    enabledByDefault: false,
    requiresApiKey: true,
    apiKeyName: 'OPENAI_API_KEY',
  },
  {
    id: 'cloud-storage',
    name: 'Cloud Storage',
    description: 'Integrate with Google Drive, Dropbox, and other cloud storage',
    longDescription:
      'Cloud storage integration for Google Drive, Dropbox, and other popular cloud storage services. Agents can help manage files across cloud platforms.',
    category: 'integration',
    icon: 'cloud',
    tools: ['list_files', 'upload_file', 'download_file', 'organize_folders', 'search_drive'],
    capabilities: ['network'],
    enabledByDefault: false,
    requiresApiKey: true,
    apiKeyName: 'CLOUD_STORAGE_CREDENTIALS',
  },
  {
    id: 'system-monitor',
    name: 'System Monitor',
    description: 'Monitor system resources and performance',
    longDescription:
      'System monitoring capabilities for tracking CPU, memory, disk usage, and performance metrics. Agents can help diagnose system issues and optimize performance.',
    category: 'utility',
    icon: 'activity',
    tools: ['check_cpu', 'check_memory', 'check_disk', 'monitor_processes', 'analyze_performance'],
    capabilities: ['process.spawn'],
    enabledByDefault: false,
    requiresApiKey: false,
  },
];

/**
 * Get skill by ID
 */
export function getSkillById(id: string): BuiltInSkill | undefined {
  return BUILT_IN_SKILLS.find((skill) => skill.id === id);
}

/**
 * Get skills by category
 */
export function getSkillsByCategory(category: SkillCategory): BuiltInSkill[] {
  return BUILT_IN_SKILLS.filter((skill) => skill.category === category);
}

/**
 * Get popular skills
 */
export function getPopularSkills(): BuiltInSkill[] {
  return BUILT_IN_SKILLS.filter((skill) => skill.popular);
}

/**
 * Get new skills
 */
export function getNewSkills(): BuiltInSkill[] {
  return BUILT_IN_SKILLS.filter((skill) => skill.new);
}

/**
 * Get enabled by default skills
 */
export function getDefaultEnabledSkills(): BuiltInSkill[] {
  return BUILT_IN_SKILLS.filter((skill) => skill.enabledByDefault);
}

/**
 * Get all categories
 */
export function getSkillCategories(): SkillCategory[] {
  return Array.from(new Set(BUILT_IN_SKILLS.map((skill) => skill.category)));
}

/**
 * Category display names and descriptions
 */
export const SKILL_CATEGORY_INFO: Record<
  SkillCategory,
  { name: string; description: string; icon: string }
> = {
  research: {
    name: 'Research',
    description: 'Gather and analyze information from various sources',
    icon: 'search',
  },
  files: {
    name: 'Files',
    description: 'Work with files, documents, and file systems',
    icon: 'file',
  },
  data: {
    name: 'Data',
    description: 'Analyze, process, and visualize data',
    icon: 'database',
  },
  development: {
    name: 'Development',
    description: 'Code, version control, and development tools',
    icon: 'code',
  },
  communication: {
    name: 'Communication',
    description: 'Email, messaging, and collaboration tools',
    icon: 'message-square',
  },
  productivity: {
    name: 'Productivity',
    description: 'Tasks, scheduling, and organization',
    icon: 'check-circle',
  },
  utility: {
    name: 'Utility',
    description: 'General purpose tools and helpers',
    icon: 'wrench',
  },
  integration: {
    name: 'Integration',
    description: 'Connect with external services and APIs',
    icon: 'link',
  },
};
