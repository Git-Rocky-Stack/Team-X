# What's New

Release notes for Team-X, newest first. The full technical record, including every internal fix, is in the [Changelog](../../CHANGELOG.md).

- [v3.5.0 (2026-10-08)](#v350-2026-10-08)
- [v3.4.0 (2026-07-11)](#v340-2026-07-11)

---

## v3.5.0 (2026-10-08)

> Download the installers from the [v3.5.0 release](https://github.com/Git-Rocky-Stack/Team-X/releases/tag/v3.5.0). The work landed in [pull request #39](https://github.com/Git-Rocky-Stack/Team-X/pull/39).

This release is about **trust**. Many settings and features in v3.4.0 looked live but did nothing. In this release every switch does what its label says, every refusal tells you why, and every model call counts against your budget.

### Highlights

- **Privacy tiers are now enforced, not just displayed.**
- **Copilot answers from your company's own knowledge.**
- **The Models tab: run GGUF models locally, browse Hugging Face, and connect LAN model servers.**
- **The command palette understands what you type.**
- **Meetings produce real minutes and file the action items as tickets.**
- **The Linux AppImage starts on a stock Ubuntu desktop with no extra packages.**
- **A more secure, faster app: Electron 44, a locked-down window, and a start-up script one-sixth the size.**

### Privacy you can rely on

In v3.4.0, **Settings → Privacy** drew an "allowed" badge next to each provider, but nothing checked the setting when a provider was actually used. "Local Only" did not stop a cloud call. Now:

- **Every model call checks your tier at the moment it is made.** That covers employee chats, ticket work, delegation, meetings, Copilot, Enhanced AI, the command palette and retrieval embeddings. A change applies to the next call; you do not need to restart.
- **External runtimes are covered too.** Codex, Claude Code and Cursor runtimes count as Proprietary Cloud. So does a command runtime, because Team-X cannot see where it sends data. An HTTP runtime counts as Local only when its address is on your own network.
- **A refused provider is never silently swapped for another.** The run stops before any API key is read. The reason, naming the provider and what to change, appears under the conversation and on the Timeline.
- **The Privacy panel shows the consequence before anything runs.** It lists every configured provider your tier refuses. If your retrieval embedding provider is one of them, the panel explains what that means: chats keep ticket, goal, project and file-vault context, but semantic search pauses until you choose an allowed embedding provider.
- **Local Only still works out of the box.** An employee with no provider of their own falls back to local Ollama instead of being refused.

### Copilot and Enhanced AI

- **Copilot is grounded in your company's knowledge.** It can search your indexed messages, tickets, meeting minutes and vault files. It also uses the facts that long-term memory has kept and the people and projects your question mentions. Ask "why is the release blocked?" and it answers from what your team actually wrote.
- **Memory survives a restart.** Long-term memory and the knowledge graph are now saved. Each Copilot exchange adds to what Team-X remembers about your company.
- **Every Enhanced AI switch works:**
  - **Query Expansion** now changes what retrieval finds.
  - **Semantic Chunking** now shapes the search index the app actually uses. Use Settings → Retrieval → Rebuild to re-chunk existing content.
  - **Long-Term Memory** and **Knowledge Graph** decide whether facts and related entities are included in Copilot answers.
  - **Tracing** now honours its sample rate.
  - Streaming Responses, Multi-Turn Planning, Max Tokens and Temperature are removed, because nothing could apply them.
- **Each company keeps its own model calls.** Enhanced AI calls now use the provider of the company that made them and count against that company's budget. Before, every company's calls ran on the first company's provider.
- **Faster search over large libraries.** Above about 4,000 indexed chunks, retrieval switches to an approximate index. It reproduces the exact ranking when set to search every partition.

### Local models: the Models tab

The local GGUF engine was finished and given a home:

- **Library:** register a `.gguf` file or watch a folder. See each model's architecture, quantization, size and parameter count, and load or unload models.
- **Discover:** search Hugging Face for GGUF models and download them. Downloads can be paused, resumed and cancelled, and quitting pauses rather than discards.
- **Endpoints:** connect an LM Studio, Ollama, llama-server, KoboldCPP or vLLM server on your network. Public addresses are refused, and the refusal explains why.
- **Runtime:** see your GPUs, the active backend and the model pool.
- **Benchmarks:** measured prompt and generation throughput, time to first token, and peak VRAM where your hardware reports it. A figure that cannot be measured says so; it is never shown as zero.
- **The bundled llama.cpp server starts on Linux and macOS.** The packaged server was missing links to its own libraries and could not start any model. A release is now refused if its bundled server does not start.

### Work and collaboration

- **The command palette uses a model.** In v3.4.0 every command fell through to the general agent. Now "hire a data engineer" or "assign T-42 to Iris" resolves to the right action. It gives up after 15 seconds instead of hanging, skips the model when the company is over its budget cap, and records its usage like any other run.
- **Meeting minutes summarise the meeting and file action items as tickets**, assigned to the attendees who took them on. If the model is unavailable, you still get the full transcript. A meeting can no longer be ended twice.
- **The Hire dialog offers every role.** It lists all 55 roles in the catalog, grouped by level and searchable. In v3.4.0 it offered two.
- **Failures are explained.** When a turn fails or is refused, the chat says why and stops showing "thinking". Before, the chat stayed busy and queued follow-up messages never sent; now they go out as normal.
- **Agentic Loop and Memory settings take effect.** Max Steps, Max Tokens, Timeout, the memory token budget and the recent-turn limit were saved but never used. They are now read on every run.

### Proactive Mode and extensions

- **Per-company switch fixed.** Turning Proactive Mode off for one company no longer turns it off for all of them, and the choice survives a restart. The master switch lives in Settings → Extensions.
- **Autonomy mode.** Choose conservative, balanced or autonomous from the dashboard. The control states what each mode currently changes.
- **Installed Extensions panel.** MCP servers can now be disabled and removed, and skills can be removed. Before, an added MCP server could not be stopped from the app. Re-enabling a server makes its tools available again immediately.

### Paperclip Import and portability

- **Paperclip Import** previews what a Paperclip export folder would become before anything is created. It can save the result as a `.teamx-package.json` and hand it to Portability to import. Folders that are not Paperclip exports are refused.

### Security and speed

- **Electron 44.** Team-X moves from Electron 31, which no longer receives security fixes, to the current Electron 44 (Chromium 152). Every known critical and high vulnerability in the app's dependencies is fixed.
- **The app window is locked down.** It runs only Team-X's own code: no inline or remote scripts, no navigation to other sites, and no pop-up windows (links open in your browser). The window gets no device permissions except copying to the clipboard, and the app answers requests only from its own window.
- **Local model servers stay local.** A server you mark as local is checked at the moment Team-X connects, so a network name that changes its address after the check cannot redirect your data to the internet.
- **Safer Hugging Face downloads.** File names that Windows treats as devices, redirects away from Hugging Face, files larger than announced, and too little disk space are all refused before anything is written. If the disk fills mid-download, the partial file is kept so you can resume.
- **Faster start-up.** The app's start-up script is about a sixth of its old size, each screen loads the first time you open it, and the monospace font is 59 KB instead of 984 KB.
- **A fresh install opens the first time.** An installed build looked for its starter roles in the wrong folder, so the very first launch stopped with "Team-X failed to start". It now opens with its Chief Executive Officer and Senior Fullstack Engineer in place.
- **Checked installers.** Before a release publishes, each Windows and macOS installer is installed, launched and uninstalled automatically. Each download comes with a provenance attestation and a software bill of materials (SBOM). v3.5.0 is not code-signed, so your operating system warns before running it; check your download against `SHA256SUMS.txt` or its attestation.

### Preview features are labelled

Linking a workspace to a hosted service, operator invites and cloud identity are previews: today they only reserve identifiers on your computer. They now carry a **Preview · local only** label. A reserved link no longer shows a green "Linked" lamp or a made-up last-sync time, and no text claims that invites are sent.

### Linux AppImage

- **No more FUSE 2 requirement.** The AppImage now embeds AppImage's static runtime, so from v3.5.0 it starts on a stock Ubuntu 22.04 or 24.04 desktop without installing `libfuse2` or `libfuse2t64`. The release pipeline proves this before publishing by booting the AppImage on a machine with FUSE 2 removed. The `--appimage-extract-and-run` flag remains as a fallback ([#16](https://github.com/Git-Rocky-Stack/Team-X/issues/16), following [#4](https://github.com/Git-Rocky-Stack/Team-X/issues/4)).

### Removed

- **The `team-x-ai` command-line tool.** Its commands printed made-up output. There is no command-line interface; everything is in the app.

### Upgrade notes

- **If you set Privacy to Local Only or Open-Source Cloud** while employees used cloud providers, those employees will now stop with a clear refusal instead of quietly using the cloud. Move them to an allowed provider or raise the tier. The Privacy panel lists who is affected.
- **Semantic Chunking now applies to the search index.** New content is chunked by structure. Run Settings → Retrieval → Rebuild once to re-chunk what is already indexed.
- **A first company without its starter employees.** If your first launch of an earlier version failed and the second worked, that company was created without its Chief Executive Officer and Senior Fullstack Engineer. Add them from the Hire dialog.
- **Database migration.** Migration `0037` adds storage for long-term memory and the knowledge graph. It runs automatically on first launch.

---

## v3.4.0 (2026-07-11)

**The Command Console.** Every screen was rebuilt on one design system: brushed-aluminum faceplates, phosphor LCD readouts, stencil word-lamps and data-bound VU meters. There are two shifts, Night Ops and Day Shift, and displays stay dark in both.

- An annunciator rail with five signal lamps: queue, local models, budget, approvals and meetings. Each blinks until acknowledged, and a second click takes you to the source.
- A consistent look across the dashboard, boards, meetings, org chart, chat, Copilot, Settings, Telemetry, Audit and Vault.
- The onboarding and user guide were refreshed for the new interface ([#3](https://github.com/Git-Rocky-Stack/Team-X/issues/3)).

See the [v3.4.0 release](https://github.com/Git-Rocky-Stack/Team-X/releases/tag/v3.4.0) for installers and the [Changelog](../../CHANGELOG.md) for details.
