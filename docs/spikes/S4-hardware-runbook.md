# S4 hardware runbook — llama-server lifecycle

**Owner:** Rocky Elsalaymeh
**Companion writeup:** [`docs/spikes/2026-05-27-S4-llama-server-lifecycle.md`](./2026-05-27-S4-llama-server-lifecycle.md)
**Harness:** [`scripts/spike-S4/lifecycle-test.mjs`](../../scripts/spike-S4/lifecycle-test.mjs)
**Estimated wall-clock:** ~20 minutes per rig (640 MB download dominates; everything else is seconds)

This runbook is what you (Rocky) execute on each physical rig to fill the
`<!-- HARDWARE-AWAITING -->` cells in the S4 writeup. The harness in
`scripts/spike-S4/lifecycle-test.mjs` does all the heavy lifting — your job is
to:

1. Stage one GGUF (TinyLlama 1.1B Q4_K_M, 638 MiB).
2. Stage the matching CPU build of `llama-server` from S1's pinned tag.
3. Run the harness in four phases (`happy`, `F1`, `F2`, `F3`).
4. Copy the four resulting JSON reports back into the writeup.

Target rigs (per the spec § 11 matrix and S1 binary inventory):

| Rig                  | OS                        | Backend in S1 | Binary asset (b9371)                          |
|---|---|---|---|
| Windows desktop      | Win 11 x64                | `win32-x64-cpu` ([S1 § Asset inventory line 56](./2026-05-27-S1-llama-binary-fetch.md)) | [`llama-b9371-bin-win-cpu-x64.zip`](https://github.com/ggml-org/llama.cpp/releases/download/b9371/llama-b9371-bin-win-cpu-x64.zip) |
| Mac (if accessible)  | macOS arm64               | `darwin-arm64-metal` ([S1 line 63](./2026-05-27-S1-llama-binary-fetch.md))               | [`llama-b9371-bin-macos-arm64.tar.gz`](https://github.com/ggml-org/llama.cpp/releases/download/b9371/llama-b9371-bin-macos-arm64.tar.gz) |

CPU on Windows is the minimum-viable rig for v3.3.0 lifecycle proof. Mac
Metal gets you GPU-path observation (`ngl > 0`) and SIGTERM-on-POSIX
semantics — both useful, neither required to clear the spike GO gate.

---

## Step 1 — Stage the GGUF (TinyLlama 1.1B Q4_K_M)

We use the canonical **anonymous-accessible** TinyLlama 1.1B Q4_K_M from
TheBloke's namespace. This is the same fixture used in S3 and S5 — single
file, ~638 MiB, no auth needed, Range-supported.

> **Why not the bartowski one in the plan?** The master plan (line 1178)
> names `bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF` — that repo does not
> exist. HF returns `401 {"error":"Invalid username or password."}` for both
> the `/api/models/...` and `/resolve/...` paths (HF collapses missing-vs-private
> to a single 401 for security). S5 documented this and standardized on
> [`TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF`](https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF)
> as the canonical anonymous fixture. S4 inherits that choice.

### URL — verified anonymous-200

```
https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

| Property        | Value                                                                |
|---|---|
| Final status    | `200 OK` (after one `302` redirect to `cas-bridge.xethub.hf.co`)     |
| Content-Length  | `668,788,096` bytes ≈ **637.8 MiB**                                  |
| ETag = SHA256   | `015c9bb0376d9c3c9dab434ecb3bd57961dce1921a5b1bf134c6f1b824c25c8d`  |
| Accept-Ranges   | `bytes`                                                              |

The ETag is the SHA256 of the file body (this is documented Hub LFS / Xet
behavior — see [Hub storage backends docs](https://huggingface.co/docs/hub/storage-backends)
and the [Xet on the Hub launch post](https://huggingface.co/blog/xet-on-the-hub)).
Step 1c below uses it to verify the local copy bit-for-bit.

### 1a. Verify the URL still responds (one-shot HEAD)

PowerShell (Windows):

```powershell
curl.exe -sI -L `
  "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" `
  | Select-String "^(HTTP|Content-Length|ETag|Accept-Ranges)"
```

Bash (macOS):

```bash
curl -sI -L \
  "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf" \
  | grep -E "^(HTTP|Content-Length|ETag|Accept-Ranges)"
```

Expected last `HTTP/...` line: `HTTP/1.1 200 OK`. If you see a 4xx, abort
and update this runbook — HF moved the fixture.

### 1b. Download to `.spike-s4-cache/`

PowerShell (Windows):

```powershell
New-Item -ItemType Directory -Force .\.spike-s4-cache | Out-Null
$env:TINYLLAMA_URL = "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
curl.exe -L --fail --progress-bar -o .\.spike-s4-cache\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf $env:TINYLLAMA_URL
```

Bash (macOS / Linux):

```bash
mkdir -p .spike-s4-cache
curl -L --fail --progress-bar \
  -o .spike-s4-cache/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
  "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
```

Expected size on disk: **668,788,096 bytes**.

### 1c. SHA256-verify the download

PowerShell (Windows):

```powershell
$expected = "015c9bb0376d9c3c9dab434ecb3bd57961dce1921a5b1bf134c6f1b824c25c8d"
$actual = (Get-FileHash .\.spike-s4-cache\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf -Algorithm SHA256).Hash.ToLower()
if ($actual -eq $expected) { Write-Host "OK — sha256 matches" -ForegroundColor Green }
else { Write-Host "FAIL — expected $expected got $actual" -ForegroundColor Red; exit 1 }
```

Bash (macOS):

```bash
EXPECTED="015c9bb0376d9c3c9dab434ecb3bd57961dce1921a5b1bf134c6f1b824c25c8d"
ACTUAL=$(shasum -a 256 .spike-s4-cache/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf | awk '{print $1}')
[ "$ACTUAL" = "$EXPECTED" ] && echo "OK — sha256 matches" || { echo "FAIL"; exit 1; }
```

> **Optional fallback model.** If TheBloke's repo is unavailable, the
> verified backup is
> [`bartowski/Llama-3.2-1B-Instruct-GGUF`](https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF) /
> `Llama-3.2-1B-Instruct-Q4_K_M.gguf` (770 MiB, ETag
> `7314cd624de8068beee86215e529a23665ff09e458977e32f30b8149764e7be1`).
> Substitute everywhere below if you fall back. Both are real and HF-200.

---

## Step 2 — Stage the `llama-server` binary (tag `b9371`)

S1 pinned tag [`b9371`](https://github.com/ggml-org/llama.cpp/releases/tag/b9371)
as Team-X's canonical upstream. We use the CPU build because (a) it's the
universal fallback for any rig and (b) the lifecycle properties under test
(spawn, ready-line, OpenAI endpoints, SIGTERM) are backend-agnostic. If you
later want to repeat on a GPU build, swap the URL and pass `--n-gpu-layers 99`
to the harness.

### 2a. Windows x64 CPU

```powershell
New-Item -ItemType Directory -Force .\.spike-s4-bin | Out-Null
curl.exe -L --fail --progress-bar `
  -o .\.spike-s4-bin\llama-b9371-bin-win-cpu-x64.zip `
  "https://github.com/ggml-org/llama.cpp/releases/download/b9371/llama-b9371-bin-win-cpu-x64.zip"
Expand-Archive -Force -Path .\.spike-s4-bin\llama-b9371-bin-win-cpu-x64.zip -DestinationPath .\.spike-s4-bin\win-cpu-x64
# Find the actual binary — llama.cpp's CPU zip extracts everything to the archive root.
Get-ChildItem -Path .\.spike-s4-bin\win-cpu-x64 -Filter llama-server.exe -Recurse | Select-Object FullName
```

Note the path printed in the last line — that's `<your absolute path>\llama-server.exe`.
You'll pass it as `--binary` below.

### 2b. macOS arm64 Metal

```bash
mkdir -p .spike-s4-bin
curl -L --fail --progress-bar \
  -o .spike-s4-bin/llama-b9371-bin-macos-arm64.tar.gz \
  "https://github.com/ggml-org/llama.cpp/releases/download/b9371/llama-b9371-bin-macos-arm64.tar.gz"
mkdir -p .spike-s4-bin/macos-arm64
tar -xzf .spike-s4-bin/llama-b9371-bin-macos-arm64.tar.gz -C .spike-s4-bin/macos-arm64
# Locate the server binary
find .spike-s4-bin/macos-arm64 -name llama-server -type f
# On macOS, clear the quarantine xattr so Gatekeeper doesn't block exec (we'll
# handle this properly via codesign in Phase 4 — for the spike, the xattr
# clear is fine).
xattr -d com.apple.quarantine .spike-s4-bin/macos-arm64/build/bin/llama-server 2>/dev/null || true
chmod +x .spike-s4-bin/macos-arm64/build/bin/llama-server
```

### 2c. Smoke check (binary is launch-able)

PowerShell:

```powershell
# llama-server --help exits 0 quickly — proves the executable + DLL deps resolve.
& .\.spike-s4-bin\win-cpu-x64\llama-server.exe --help 2>&1 | Select-Object -First 5
```

Bash:

```bash
.spike-s4-bin/macos-arm64/build/bin/llama-server --help 2>&1 | head -5
```

If you get a "command not found" or "dll missing" / "dyld" error, stop and
note it on the writeup's `Hardware notes` row before continuing — that
itself is a finding.

---

## Step 3 — Run the happy-path test

This is the spec's GO gate: server spawns, becomes ready, answers chat +
embeddings, exits cleanly, releases the port.

### Windows

```powershell
$binary = (Get-ChildItem .\.spike-s4-bin\win-cpu-x64 -Filter llama-server.exe -Recurse).FullName
$model  = (Resolve-Path .\.spike-s4-cache\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf).Path

node scripts/spike-S4/lifecycle-test.mjs `
  --binary $binary `
  --model  $model `
  --phase  happy `
  --report .\.spike-s4-cache\report.win-cpu.happy.json
```

### macOS

```bash
node scripts/spike-S4/lifecycle-test.mjs \
  --binary .spike-s4-bin/macos-arm64/build/bin/llama-server \
  --model  .spike-s4-cache/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
  --phase  happy \
  --n-gpu-layers 99 \
  --report .spike-s4-cache/report.mac-metal.happy.json
```

Expected `[happy] …` lines on stderr (real wall-clock numbers will vary):

```
[happy] allocating free port...
[happy] allocated port <NNNNN>
[happy] spawning <binary> -m <model> --port <NNNNN> ...
[happy] ready in <N> ms (pattern: /<one-of-the-5-regex-sources>/)
[happy] chat: HTTP 200 in <N> ms
[happy] embed: HTTP 200 in <N> ms
[happy] sending SIGTERM...
[happy] exit code=<N> signal=<NULL-or-SIGTERM> in <N> ms; port rebind in <N> ms
[report] wrote .spike-s4-cache/report.win-cpu.happy.json
```

The JSON report on stdout (and at `--report`'s path) contains the
machine-readable values. **Paste the values into the writeup's "Lifecycle
observations" table** under the correct rig column.

### What can go wrong here

| Symptom                                                       | Likely cause                                                                                                              | What to do |
|---|---|---|
| `error: ready-timeout after 60000 ms`                         | Model load is slow on first cold filesystem cache hit, or the binary log line changed in a newer b<NNNN>                  | Rerun with `--ready-timeout-ms 120000`. If still failing, capture the full stderr by appending `2>stderr.log` and grep for the actual listen-line wording so we can extend `READY_PATTERNS`.                |
| `[happy] chat ERROR: fetch failed`                            | Server crashed during ready-line emission (rare) or local firewall blocking 127.0.0.1                                     | Check Windows Defender Firewall outbound rules; rerun and capture `stderr_tail` from the JSON report.       |
| `embed: HTTP 404` or `embed: HTTP 501`                        | The b<NNNN> build was compiled without embeddings support, or expects a different model that has an embedding head        | This is an observation, not a failure. Note the HTTP code in the writeup — Phase 9 will need to model-class the embedding path. The harness keeps going.                                              |
| `escalatedToSigkill: true` in JSON                            | Server didn't exit within 5 s of SIGTERM                                                                                  | This IS a finding — note it. On Windows this is expected occasionally because `process.kill('SIGTERM')` is approximately `TerminateProcess`; if you see this on POSIX, that's the real signal.        |
| `portReleaseMs: -1`                                           | Port never released within 2.5 s of exit                                                                                  | Big finding. Capture the report JSON, note in writeup, escalate to phase 2 design.                                                                                                                  |

---

## Step 4 — Run the three failure-mode tests

These prove that the production wrapper can map each failure to a typed
error (spec § 14.1: `server-spawn-failed`, `port-bind-failed`,
`context-exceeded`) instead of a generic crash.

### F1 — bogus model path

```powershell
node scripts/spike-S4/lifecycle-test.mjs `
  --binary $binary `
  --model  $model `
  --phase  F1 `
  --report .\.spike-s4-cache\report.win-cpu.F1.json
```

```bash
node scripts/spike-S4/lifecycle-test.mjs \
  --binary .spike-s4-bin/macos-arm64/build/bin/llama-server \
  --model  .spike-s4-cache/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf \
  --phase  F1 \
  --report .spike-s4-cache/report.mac-metal.F1.json
```

The harness overrides `-m` to a guaranteed-bogus path
(`C:\nonexistent\team-x-s4\does-not-exist.gguf` on Windows,
`/tmp/team-x-s4-does-not-exist.gguf` on POSIX) and waits up to 10 s for
the process to exit. Expected JSON output keys:

- `F1.exitCode`: non-zero (typically `1` on POSIX, `1` or
  `0xC0000005`-mapped value on Windows depending on whether llama-server
  exits via the loader error path or asserts).
- `F1.exitMs`: under 5000 ms; loader fast-fails on file-not-found.
- `F1.matchedFailurePattern`: should be **non-null**. Most likely
  `/failed to load model/i` or `/no such file/i`.
- `F1.stderrSample`: first 400 bytes of stderr — contains the human
  message we'll surface in the UI ("This model file is missing or
  corrupt — re-download or pick another"). Copy this verbatim into the
  writeup.

### F2 — port collision

```powershell
node scripts/spike-S4/lifecycle-test.mjs `
  --binary $binary `
  --model  $model `
  --phase  F2 `
  --report .\.spike-s4-cache\report.win-cpu.F2.json
```

The harness allocates a free port, occupies it with a dummy
`net.createServer()` listener, then invokes llama-server with
`--port <occupied>`. Expected keys:

- `F2.exitCode`: non-zero.
- `F2.exitMs`: under 5000 ms (some builds load the model BEFORE binding,
  so could be up to 30 s on a cold-cache fresh load — the harness
  defensively SIGKILLs at 30 s if it didn't exit).
- `F2.matchedFailurePattern`: should match one of
  `/address already in use/i`, `/EADDRINUSE/i`, `/WSAEADDRINUSE/i`, or
  `/failed to bind/i`.
- `F2.stderrSample`: paste into writeup verbatim.

> **Side observation worth noting.** If the server loaded the model
> BEFORE attempting bind, the `F2.exitMs` will reflect model-load time
> (~3-15 s for TinyLlama on cold cache). That's a Phase-2 ergonomics
> finding: the production wrapper should pre-flight the bind by trying a
> dummy `net.createServer().listen(port)` itself before spawning the
> server, so we fail fast without paying model-load cost.

### F3 — context overflow

```powershell
node scripts/spike-S4/lifecycle-test.mjs `
  --binary $binary `
  --model  $model `
  --phase  F3 `
  --report .\.spike-s4-cache\report.win-cpu.F3.json
```

The harness spawns the server with `-c 256` (256-token context window)
then POSTs a ~5000-token prompt. Expected keys:

- `F3.spawnedOk`: `true` (the server must NOT crash from this).
- `F3.chatStatus`: 400 (or another 4xx).
- `F3.matchedErrorShape`: `'openai-error'` — the body should look like
  `{"error":{"message":"...", "type":"...", "code":...}}` per the
  [OpenAI Chat Completions error schema](https://platform.openai.com/docs/guides/error-codes/api-errors).
- `F3.serverStillAliveAfterRequest`: **`true`**. This is the must-pass
  cell. If it's false, that's a regression we need to file upstream and
  Phase 9 needs a guard.
- `F3.chatBodySample`: paste into writeup verbatim — it's the exact
  message Phase 9 will surface as `context-exceeded`.

---

## Step 5 — Capture & paste the JSON reports

You should now have, per rig:

```
.spike-s4-cache/
  report.<rig>.happy.json
  report.<rig>.F1.json
  report.<rig>.F2.json
  report.<rig>.F3.json
```

For each rig:

1. Open the writeup at [`docs/spikes/2026-05-27-S4-llama-server-lifecycle.md`](./2026-05-27-S4-llama-server-lifecycle.md).
2. Find the `<!-- HARDWARE-AWAITING -->` markers in:
   - The **Lifecycle observations** table — paste `spawnMs`, `readyMs`,
     `chat.latencyMs`, `embed.latencyMs`, `termination.exitMs`, and
     `termination.portReleaseMs` into the matching rig column.
   - The **Failure modes observed** section — paste the
     `matchedFailurePattern` regex source and the `stderrSample` excerpt
     for F1 + F2, and the `chatStatus` + `chatBodySample` for F3.
   - The **Ready-pattern observed** field — paste `readyPattern` from
     the happy run.
3. Delete the `<!-- HARDWARE-AWAITING -->` comment line for any row you
   filled in. Leave it in place for rows you didn't measure (e.g. the
   Mac column if you only ran Windows).
4. Commit the writeup edits with the message
   `docs(spike-S4): fill HARDWARE-AWAITING from <rig> run` and the
   co-authored trailer.

The reports themselves should **NOT be checked in** — `.spike-s4-cache/`
is in `.gitignore`. The writeup is the system of record.

---

## Validation checklist

Before declaring S4 GO on the writeup, the following must all be true (per
rig you measured):

- [ ] Happy: `readyMs` is finite (i.e. ready-line detected within timeout).
- [ ] Happy: `chat.status === 200`.
- [ ] Happy: `embed.status === 200` **OR** the writeup notes the build
  doesn't expose embeddings and Phase 9 will route around it.
- [ ] Happy: `termination.exitCode === 0` (POSIX) **OR** the writeup
  notes the Windows `TerminateProcess` exit-code observation and Phase 9
  treats it as expected on Win32.
- [ ] Happy: `termination.portReleaseMs >= 0` (i.e. port did release).
- [ ] Happy: `termination.escalatedToSigkill === false` **OR** the
  writeup notes the escalation as an OS-specific observation.
- [ ] F1: `matchedFailurePattern !== null` **AND** `exitMs < 10_000`.
- [ ] F2: `matchedFailurePattern !== null` (any of the 7 regex sources).
- [ ] F3: `serverStillAliveAfterRequest === true` **AND** `chatStatus`
  is a 4xx **AND** `matchedErrorShape === 'openai-error'`.

If any of those fail and the writeup can't justify it with a Phase-2
mitigation, the spike decision should change from GO to GO WITH CHANGES
(or NO-GO if F3's "server stays up" is violated — that one is a hard
gate).

---

## Time budget — what to expect

| Step                                      | Wall-clock (Windows CPU)                       |
|---|---|
| 1. GGUF download (638 MiB)                | 30 s on gigabit; 5 min on slower links         |
| 1c. SHA256 verify                         | 5-10 s                                         |
| 2. llama-server fetch + extract           | 10-20 s                                        |
| 3. Happy run                              | ~5-15 s (model load dominates first run)       |
| 4a. F1 bogus model                        | 1-3 s                                          |
| 4b. F2 port collision                     | 5-15 s (depends on whether load-before-bind)   |
| 4c. F3 context overflow                   | 10-30 s (spawns + loads model, then 1 request) |
| 5. Paste into writeup, commit             | 5-10 minutes                                   |
| **Total**                                 | **~15-20 minutes** on a normal link            |
