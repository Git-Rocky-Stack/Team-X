/**
 * Application menu configuration.
 *
 * Defines the native menu bar for Windows/Linux (Darwin uses a
 * different shape with app-level menu). The Help menu includes an
 * About dialog that displays version, license, and links.
 */

import { BrowserWindow, Menu, app, dialog, shell } from 'electron';

const PACKAGE_VERSION = app.getVersion();

/**
 * Show the About Strategia-X dialog.
 *
 * Displays app metadata, MIT license notice, GitHub repository link,
 * and credits. Opens URLs in the default browser.
 */
export function showAboutDialog(): void {
  const win =
    BrowserWindow.fromWebContents('about-strategia-x' as any) ??
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows()[0];

  if (!win) return;

  void dialog
    .showMessageBox(win, {
      type: 'info',
      title: 'About Strategia-X',
      message: `Strategia-X ${PACKAGE_VERSION}`,
      detail: [
        'Operational command shell for autonomous AI teams.',
        '',
        'License: MIT',
        'Copyright © 2025 Rocky Stack / Strategia',
        '',
        'An open-source project for AI-powered team orchestration.',
        'Source code available on GitHub.',
        '',
        'Built with Electron, React, and TypeScript.',
        'Powered by Claude, Anthropic, and Ollama.',
      ].join('\n'),
      buttons: ['View on GitHub', 'Close'],
      defaultId: 0,
      cancelId: 1,
    })
    .then((result) => {
      if (result.response === 0) {
        void shell.openExternal('https://github.com/Git-Rocky-Stack/Team-X');
      }
    });
}

/**
 * Build and return the application menu template.
 *
 * Windows/Linux shape:
 * - File (minimal - just Quit for now)
 * - Edit (standard clipboard items)
 * - Help (About, docs, issue tracker)
 *
 * macOS would extend this with an app-level menu, but Phase 1
 * targets Windows 11 first.
 */
export function buildMenuTemplate(): Electron.MenuItemConstructorOptions[] {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      role: 'fileMenu',
      submenu: [
        {
          role: 'quit',
        },
      ],
    },
    {
      role: 'editMenu',
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Strategia-X...',
          click: showAboutDialog,
        },
        {
          type: 'separator',
        },
        {
          label: 'Documentation',
          click: () => void shell.openExternal('https://github.com/Git-Rocky-Stack/Team-X#readme'),
        },
        {
          label: 'Report an Issue',
          click: () => void shell.openExternal('https://github.com/Git-Rocky-Stack/Team-X/issues'),
        },
        {
          label: 'View Source on GitHub',
          click: () => void shell.openExternal('https://github.com/Git-Rocky-Stack/Team-X'),
        },
        {
          type: 'separator',
        },
        {
          label: 'License (MIT)',
          click: () =>
            void shell.openExternal('https://github.com/Git-Rocky-Stack/Team-X/blob/main/LICENSE'),
        },
      ],
    },
  ];

  // macOS: add app-level menu with About
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: `About ${app.getName()}`,
          click: showAboutDialog,
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  return template;
}

/**
 * Set the application menu.
 *
 * Call once during app boot (after app.whenReady()).
 */
export function setupApplicationMenu(): void {
  const template = buildMenuTemplate();
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
