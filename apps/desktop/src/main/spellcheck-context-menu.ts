import { type BrowserWindow, Menu } from 'electron';

import { buildSpellcheckContextMenuTemplate } from './spellcheck-context-menu-template.js';

export function attachSpellcheckContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_event, params) => {
    const template = buildSpellcheckContextMenuTemplate(params, {
      replaceMisspelling: (suggestion) => {
        win.webContents.replaceMisspelling(suggestion);
      },
      addWordToDictionary: (word) => {
        win.webContents.session.addWordToSpellCheckerDictionary(word);
      },
    });

    if (template.length === 0) return;

    Menu.buildFromTemplate(template).popup({ window: win });
  });
}
