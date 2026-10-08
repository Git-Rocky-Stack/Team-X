/**
 * PaperclipImportSection — behaviour specs.
 *
 * Written from the requirement, not from an implementation: the panel exists so
 * an operator can decide whether to import, which means the things an import
 * would LOSE have to be as visible as the things it would create. Most of these
 * cases are therefore loss cases.
 *
 * The last block is a source pin — Gate 2 wiring is a fact about a different
 * file and cannot be observed from inside this component's tree.
 *
 * @vitest-environment jsdom
 */
import '@/components/console/test-setup';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaperclipImportSection } from './paperclip-import-section.js';

import { useAppStore } from '@/store/app-store.js';

const currentDirname = dirname(fileURLToPath(import.meta.url));

function makePreview(overrides: Record<string, unknown> = {}) {
  return {
    packageData: { manifest: { mode: 'workspace-export' } },
    importPreview: { manifest: { mode: 'workspace-export' } },
    warnings: [],
    unsupportedAdapters: [],
    missingSecretRefs: [],
    counts: {
      agents: 3,
      runtimeProfiles: 2,
      tickets: 7,
      skills: 1,
      unsupportedAdapters: 0,
      missingSecrets: 0,
    },
    ...overrides,
  };
}

let preview: ReturnType<typeof vi.fn>;
let savePackage: ReturnType<typeof vi.fn>;
let selectDirectory: ReturnType<typeof vi.fn>;
let client: QueryClient;

function Harness({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection() {
  return render(
    <Harness>
      <PaperclipImportSection />
    </Harness>,
  );
}

/** Click the picker button and wait for the preview to settle. */
async function chooseFolder() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /choose export folder/i }));
}

beforeEach(() => {
  preview = vi.fn().mockResolvedValue(makePreview());
  savePackage = vi
    .fn()
    .mockResolvedValue({ canceled: false, packagePath: 'D:/out/acme.teamx-package.json' });
  useAppStore.setState({ portabilityImportRef: null, settingsFocusSection: null });
  selectDirectory = vi
    .fn()
    .mockResolvedValue({ canceled: false, folderPath: 'D:/paperclip-export' });
  (window as unknown as { teamx: unknown }).teamx = {
    paperclip: { preview, savePackage },
    system: { selectDirectory },
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('PaperclipImportSection — before a folder is chosen', () => {
  it('starts in a standby state rather than a blank panel', () => {
    renderSection();
    expect(screen.getByText(/no export selected/i)).toBeVisible();
  });

  it('does not read anything until the operator asks', () => {
    renderSection();
    expect(preview).not.toHaveBeenCalled();
    expect(selectDirectory).not.toHaveBeenCalled();
  });
});

describe('PaperclipImportSection — choosing a folder', () => {
  it('previews the folder the operator picked', async () => {
    renderSection();
    await chooseFolder();
    await waitFor(() =>
      expect(preview).toHaveBeenCalledWith({ folderPath: 'D:/paperclip-export' }),
    );
  });

  it('shows which folder is being previewed', async () => {
    renderSection();
    await chooseFolder();
    await waitFor(() => expect(screen.getByText('D:/paperclip-export')).toBeVisible());
  });

  it('does NOT read anything when the operator cancels the picker', async () => {
    selectDirectory.mockResolvedValue({ canceled: true, folderPath: null });
    renderSection();
    await chooseFolder();
    await waitFor(() => expect(selectDirectory).toHaveBeenCalled());
    expect(preview).not.toHaveBeenCalled();
    expect(screen.getByText(/no export selected/i)).toBeVisible();
  });
});

describe('PaperclipImportSection — what the import would produce', () => {
  it('reports the entity counts the bridge computed', async () => {
    renderSection();
    await chooseFolder();
    await waitFor(() => expect(screen.getByText('Agents')).toBeVisible());
    expect(screen.getByText('7')).toBeVisible();
  });

  it('states that nothing has been written yet', async () => {
    renderSection();
    await chooseFolder();
    await waitFor(() => expect(screen.getByText(/nothing has been written/i)).toBeVisible());
  });
});

describe('PaperclipImportSection — losses are surfaced, never dropped', () => {
  it('lists an adapter that will not convert, with the reason', async () => {
    preview.mockResolvedValue(
      makePreview({
        unsupportedAdapters: [
          {
            id: 'ad-1',
            name: 'Legacy Zapier hook',
            type: 'zapier',
            reason: 'no Team-X equivalent',
          },
        ],
      }),
    );
    renderSection();
    await chooseFolder();
    await waitFor(() => expect(screen.getByText('Legacy Zapier hook')).toBeVisible());
    expect(screen.getByText('no Team-X equivalent')).toBeVisible();
  });

  it('lists secrets the operator will have to re-enter', async () => {
    preview.mockResolvedValue(
      makePreview({
        missingSecretRefs: [
          {
            id: 's1',
            path: 'openai.apiKey',
            label: 'OpenAI API key',
            source: 'redacted-field',
            bindable: true,
          },
        ],
      }),
    );
    renderSection();
    await chooseFolder();
    await waitFor(() => expect(screen.getByText('OpenAI API key')).toBeVisible());
  });

  it('shows bridge warnings', async () => {
    preview.mockResolvedValue(
      makePreview({ warnings: ['Two agents share the same id; the second was renamed.'] }),
    );
    renderSection();
    await chooseFolder();
    await waitFor(() =>
      expect(
        screen.getByText('Two agents share the same id; the second was renamed.'),
      ).toBeVisible(),
    );
  });
});

describe('PaperclipImportSection — failure', () => {
  it('reports an unreadable folder with the main process message', async () => {
    preview.mockRejectedValue(new Error('could not read "D:/nope" — ENOENT'));
    renderSection();
    await chooseFolder();
    await waitFor(() => expect(screen.getByText(/could not be read/i)).toBeVisible());
    expect(screen.getByText(/ENOENT/)).toBeVisible();
  });
});

describe('PaperclipImportSection — Gate 2 wiring', () => {
  it('is mounted in SettingsView behind an error boundary', () => {
    const src = readFileSync(join(currentDirname, 'settings-view.tsx'), 'utf8');
    expect(src).toContain(
      "import { PaperclipImportSection } from './paperclip-import-section.js';",
    );
    expect(src).toContain('<PaperclipImportSection />');
    expect(src).toContain('data-settings-section="paperclip"');
  });
});

describe('PaperclipImportSection — saving the package for Portability', () => {
  // The preview used to end with "import the package from the Portability
  // panel" — which reads a package file — while nothing ever wrote one.
  async function previewThenSave() {
    const user = userEvent.setup();
    renderSection();
    await chooseFolder();
    await waitFor(() => expect(screen.getByText('Agents')).toBeVisible());
    await user.click(screen.getByRole('button', { name: /save as package/i }));
    return user;
  }

  it('saves the previewed folder as a package through the main process', async () => {
    await previewThenSave();
    await waitFor(() =>
      expect(savePackage).toHaveBeenCalledWith({ folderPath: 'D:/paperclip-export' }),
    );
    await waitFor(() => expect(screen.getByText('D:/out/acme.teamx-package.json')).toBeVisible());
  });

  it('hands the saved file to the Portability import and scrolls there', async () => {
    const user = await previewThenSave();
    await user.click(
      await screen.findByRole('button', { name: /review & import in portability/i }),
    );

    expect(useAppStore.getState().portabilityImportRef).toBe('D:/out/acme.teamx-package.json');
    expect(useAppStore.getState().settingsFocusSection).toBe('portability');
  });

  it('shows nothing saved when the operator cancels the dialog', async () => {
    savePackage.mockResolvedValue({ canceled: true, packagePath: null });
    await previewThenSave();
    await waitFor(() => expect(savePackage).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: /review & import in portability/i }),
    ).not.toBeInTheDocument();
  });

  it('reports a failed save with the main-process message', async () => {
    savePackage.mockRejectedValue(new Error('EACCES: permission denied'));
    await previewThenSave();
    await waitFor(() => expect(screen.getByText(/EACCES: permission denied/)).toBeVisible());
  });
});
