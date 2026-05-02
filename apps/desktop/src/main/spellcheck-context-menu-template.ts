import type { MenuItemConstructorOptions } from 'electron';

const MAX_SPELLING_SUGGESTIONS = 8;

export interface SpellcheckContextMenuParams {
  isEditable: boolean;
  selectionText: string;
  misspelledWord: string;
  dictionarySuggestions: string[];
  spellcheckEnabled: boolean;
  editFlags: {
    canUndo: boolean;
    canRedo: boolean;
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canDelete: boolean;
    canSelectAll: boolean;
  };
}

export interface SpellcheckContextMenuActions {
  replaceMisspelling: (suggestion: string) => void;
  addWordToDictionary: (word: string) => void;
}

function appendSeparator(template: MenuItemConstructorOptions[]): void {
  const last = template.at(-1);
  if (template.length === 0 || last?.type === 'separator') return;
  template.push({ type: 'separator' });
}

function normalizeSuggestions(suggestions: string[], misspelledWord: string): string[] {
  const normalized = new Set<string>();
  const lowerMisspelledWord = misspelledWord.toLocaleLowerCase();

  for (const suggestion of suggestions) {
    const trimmed = suggestion.trim();
    if (!trimmed || trimmed.toLocaleLowerCase() === lowerMisspelledWord) continue;
    normalized.add(trimmed);
    if (normalized.size >= MAX_SPELLING_SUGGESTIONS) break;
  }

  return [...normalized];
}

function addSpellingItems(
  template: MenuItemConstructorOptions[],
  params: SpellcheckContextMenuParams,
  actions: SpellcheckContextMenuActions,
): void {
  const misspelledWord = params.misspelledWord.trim();
  if (!params.isEditable || !params.spellcheckEnabled || misspelledWord.length === 0) return;

  const suggestions = normalizeSuggestions(params.dictionarySuggestions, misspelledWord);
  if (suggestions.length > 0) {
    for (const suggestion of suggestions) {
      template.push({
        label: suggestion,
        click: () => actions.replaceMisspelling(suggestion),
      });
    }
  } else {
    template.push({
      label: 'No spelling suggestions',
      enabled: false,
    });
  }

  template.push({
    label: `Add "${misspelledWord}" to Dictionary`,
    click: () => actions.addWordToDictionary(misspelledWord),
  });
}

function addEditableItems(
  template: MenuItemConstructorOptions[],
  params: SpellcheckContextMenuParams,
): void {
  if (!params.isEditable) return;

  const { editFlags } = params;
  appendSeparator(template);
  template.push(
    { role: 'undo', label: 'Undo', enabled: editFlags.canUndo },
    { role: 'redo', label: 'Redo', enabled: editFlags.canRedo },
  );

  appendSeparator(template);
  template.push(
    { role: 'cut', label: 'Cut', enabled: editFlags.canCut },
    { role: 'copy', label: 'Copy', enabled: editFlags.canCopy },
    { role: 'paste', label: 'Paste', enabled: editFlags.canPaste },
    { role: 'delete', label: 'Delete', enabled: editFlags.canDelete },
  );

  appendSeparator(template);
  template.push({ role: 'selectAll', label: 'Select All', enabled: editFlags.canSelectAll });
}

function addSelectionItems(
  template: MenuItemConstructorOptions[],
  params: SpellcheckContextMenuParams,
): void {
  if (params.isEditable || params.selectionText.trim().length === 0) return;
  template.push({ role: 'copy', label: 'Copy', enabled: params.editFlags.canCopy });
}

export function buildSpellcheckContextMenuTemplate(
  params: SpellcheckContextMenuParams,
  actions: SpellcheckContextMenuActions,
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];
  addSpellingItems(template, params, actions);
  addEditableItems(template, params);
  addSelectionItems(template, params);
  return template;
}
