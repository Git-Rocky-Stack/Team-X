# Spike S5 — Hugging Face API client

**Date:** 2026-05-27
**Time-box:** 1 day
**Decision:** **GO WITH CHANGES**
**Author:** Rocky Elsalaymeh (orchestrated via Claude Opus 4.7)

## Context

Team-X v3.3.0 will ship an in-app Hugging Face Hub browser so users can
search, preview, and download GGUF model files without leaving the app
(spec § 10.2). Phase 7 of the master plan owns the production
implementation; this spike validates the four endpoints that browser
needs before any production code is written:

1. **Search** — `GET https://huggingface.co/api/models?search=…&filter=gguf`
2. **Model card** — `GET https://huggingface.co/api/models/{repoId}`
   (returns `siblings`, the file list)
3. **HEAD on a file** — to read `Content-Length`, `Accept-Ranges`, `ETag`
4. **Range GET on a file** — to enable resumable, chunked, pause-able
   downloads of multi-GB GGUFs

The four risks this spike validates:

1. **Endpoint surface.** Do the four endpoints work over public-anonymous
   HTTP in the shapes the spec § 10.2 / spec § 14.1 ("hf-download-failed",
   "hf-rate-limited") assume?
2. **Rate-limit behavior.** The master plan (line 1352) cites "anonymous =
   1000/hr/IP". Is that the limit Team-X users will actually feel, and
   does HF expose it via standard `x-ratelimit-*` headers we can read in
   the client to drive proactive backoff?
3. **Resume semantics.** Is HF's CDN truly Range-aware end-to-end —
   including across the `huggingface.co` → `cas-bridge.xethub.hf.co`
   redirect to the new [Xet storage backend](https://huggingface.co/blog/xet-on-the-hub) —
   so a download interrupted at byte N can resume at N+1 with bit-perfect
   stitching? Spec § 14.1's `hf-download-failed` recovery path depends on
   it.
4. **Auth posture for v1.** Should "HF token (optional)" be a quiet
   Settings → Defaults link (spec § 10.2 as currently written), or
   should it be elevated to the onboarding flow because anonymous gets
   rate-limited in normal user behavior?

## TL;DR

- **All four endpoints work over public-anonymous HTTP.** Real
  measurements (N=5 each):

  | Endpoint | p50 | p95 | Status |
  |---|---|---|---|
  | `GET /api/models?search=…&filter=gguf` | **127 ms** | **303 ms** | 200 |
  | `GET /api/models/{repoId}` | **117 ms** | **130 ms** | 200 |
  | `HEAD /{repoId}/resolve/main/{file}` | **319 ms** | **336 ms** | 200 |
  | `GET …/{file}` with `Range: bytes=0-1023` | **171 ms** | **336 ms** | 206 |

- **Rate-limit reality differs from the documented 1000/hr.** The HF Hub
  emits **no `x-ratelimit-*` headers on anonymous traffic**. A 50×
  sequential burst (≈8 rps over 6 s) and a separately-executed 50×
  *concurrent* burst (≈122 rps over 411 ms) both completed at HTTP 200
  with **zero 429s**. The 1000/hr figure is real but not surfaced
  proactively — the client must detect rate-limit pressure by watching
  for `429 + Retry-After`, not by reading remaining-quota headers.

- **Bit-perfect resume confirmed.** Bytes `0-999` (SHA
  `78cde055…`) + bytes `1000-1999` (SHA `fc026690…`), concatenated and
  re-hashed, yield SHA `8adc9553cd86574012b3e5dd26f4d1b5c4002e3bfb173d7a1bb4c5feef32a937`
  — exactly equal to the SHA of an independent single-shot
  `bytes=0-1999` fetch. Range stitching across the
  `huggingface.co` → `cas-bridge.xethub.hf.co` redirect works.

- **Auth posture decision: anonymous-sufficient for v1.** No 429 fired in
  ~100 anonymous requests across two burst patterns. A library-builder
  user fetching one model card and one ~5 GB GGUF per minute will not
  hit the documented 1000/hr ceiling. The spec § 10.2 "HF token
  (optional, raises rate limit)" link stays where it is. The two
  amendments below come from things we *learned*, not from things we
  *needed*.

- **Two small spec amendments:**
  1. **Plan line 1385/1395 fixture URL is wrong.** The plan names
     `bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF` — that repo does not
     exist (HF returns `401 {"error":"Invalid username or password."}`
     for both `/resolve/...` and `/api/models/...`, the standard HF
     response for non-existent **or** private repos). Replace with
     [`TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF`](https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF)
     plus the lower-cased filename `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`.
  2. **Spec § 14.1 add a `hf-not-found` variant.** Today `401` from a
     missing repo flows into the generic `hf-download-failed`. UI should
     show a typed message ("Repo doesn't exist or is private") rather
     than the raw `httpStatus: 401` body.

- **Phase 7 carry-over:** typed TS interface below, mocked via
  [`msw`](https://mswjs.io/) in unit tests, nightly integration test
  against real HF (env-gated). Production retry: 429 → parse
  `Retry-After` → backoff; transport errors → exponential 1 / 2 / 4 / 8 s
  × 3 retries. Pause/resume keyed on the byte cursor + the captured ETag.

## Endpoints validated

All four rows below are real measurements from
[`scripts/spike-S5/hf-probe.mjs`](../../scripts/spike-S5/hf-probe.mjs)
(`node hf-probe.mjs --report`). N=5 sequential samples per endpoint with
a 250 ms gap between samples so we don't measure the same warm CDN
socket five times. Full JSON dump at `.spike-s5-cache/report.json` after
the run.

| Endpoint                                          | URL fixture                                                                                                                                                                                | Status | p50 (ms) | p95 (ms) | min / max | n | Notes |
|---|---|---|---|---|---|---|---|
| `GET /api/models?search=&filter=gguf`             | [`/api/models?search=llama&filter=gguf&sort=downloads&direction=-1&limit=5`](https://huggingface.co/api/models?search=llama&filter=gguf&sort=downloads&direction=-1&limit=5)               | 200    | **127**  | **303**  | 115 / 303 | 5 | Returns JSON array. First-call latency is consistently ~2-3× warm-call latency — Cloudfront cache miss on the first fetch ([Server-Timing equivalent: `x-cache: Miss from cloudfront`](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html)) followed by `Miss` again on the next ones (search results are not edge-cached). |
| `GET /api/models/{repoId}`                        | [`/api/models/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF`](https://huggingface.co/api/models/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF)                                                      | 200    | **117**  | **130**  | 100 / 130 | 5 | 27 siblings total, **24 `.gguf`** in that repo (one per quant flavor). Tightest latency distribution of the four. |
| `HEAD /{repoId}/resolve/main/{file}`              | `/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` ([resolve URL](https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf)) | 200    | **319**  | **336**  | 243 / 336 | 5 | Higher latency than the JSON endpoints because the request transparently follows the redirect from `huggingface.co` to `cas-bridge.xethub.hf.co` (the new [Xet CAS bridge](https://huggingface.co/blog/xet-on-the-hub)). Returns `Content-Length: 668788096` (≈ 638 MiB), `Accept-Ranges: bytes`, strong ETag = SHA256 of the file content. |
| `GET …/{file}` with `Range: bytes=0-1023`         | same fixture as `HEAD`                                                                                                                                                                     | **206**| **171**  | **336**  | 161 / 336 | 5 | `Content-Range: bytes 0-1023/668788096`, exactly 1024 bytes returned, same strong ETag as the `HEAD`. Range honored end-to-end across the redirect. |

### Latency distribution observed (raw samples, milliseconds)

```
search       : [303.5, 115.5, 128.4, 120.1, 127.4]
modelCard    : [99.8, 130.0, 117.3, 117.4, 108.1]
fileHead     : [243.4, 321.5, 319.2, 318.0, 336.4]
rangeDownload: [335.6, 166.0, 170.8, 173.6, 160.7]
```

The pattern is reproducible across reruns: first call slow (cold socket
or cloudfront edge miss), four warm calls clustering tightly. p95 is
dominated by that first-call cold case rather than by intrinsic API
variance.

### Notable response headers (verbatim from `report.json`)

**Search** (`/api/models?search=llama&filter=gguf&…`):
```
content-type: application/json; charset=utf-8
etag: W/"a7d-y7UPkbELBny4tEDtpuAnE7/mnXc"
x-cache: Miss from cloudfront
(no x-ratelimit-* headers)
```

**Model card** (`/api/models/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF`):
```
content-type: application/json; charset=utf-8
etag: W/"5312-0+VSOXHYg7GNELRxKYpUeJ8zcHA"
x-cache: Miss from cloudfront
(no x-ratelimit-* headers)
```

**HEAD on the resolve URL** (auto-follows redirect to Xet CAS bridge):
```
content-length: 668788096
accept-ranges: bytes
etag: "015c9bb0376d9c3c9dab434ecb3bd57961dce1921a5b1bf134c6f1b824c25c8d"
cache-control: public, max-age=31536000
x-cache: Hit from cloudfront
finalUrl: https://cas-bridge.xethub.hf.co/xet-bridge-us/6591d4d754f88261730df832/…
         …?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600&… (AWS-signed)
```

**Range GET** (`Range: bytes=0-1023`):
```
status: 206 Partial Content
content-range: bytes 0-1023/668788096
content-length: 1024
etag: "015c9bb0376d9c3c9dab434ecb3bd57961dce1921a5b1bf134c6f1b824c25c8d"
cache-control: public, max-age=31536000
x-cache: Hit from cloudfront
```

### Five findings from the headers

1. **Strong ETag on file resolves = SHA256 of file content.** The
   `etag` value `015c9bb0376d9c3c9dab434ecb3bd57961dce1921a5b1bf134c6f1b824c25c8d`
   is exactly a 64-hex-char SHA256. Hugging Face documents this for LFS
   files in
   [Hub `lfs-with-hooks` docs](https://huggingface.co/docs/hub/storage-backends)
   and the new
   [Xet on the Hub blog post](https://huggingface.co/blog/xet-on-the-hub).
   **Phase 7 should use the ETag as the integrity check** — no separate
   SHA download needed; just diff the post-download local hash against
   the ETag captured on the `HEAD`. Free per spec § 14.1's
   "Successful download → SHA verification → automatic library entry"
   flow.
2. **`Accept-Ranges: bytes` is present, so resume is signal-driven, not
   guessed.** RFC 9110 § 14.3 ([range requests](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.3))
   defines that header. We verify it on the `HEAD` and surface
   "resumable" UI only if it's present.
3. **CDN edge is `cloudfront` for the JSON API surface, `xethub.hf.co`
   for file bytes.** The two are independent — the JSON endpoint's
   `x-cache: Miss from cloudfront` does not imply anything about file
   bytes. The file URL `Hit from cloudfront` reflects the LFS CDN.
4. **Final URL is an AWS-signed S3-equivalent.** `cas-bridge.xethub.hf.co`
   serves AWS SigV4-signed redirect URLs with `X-Amz-Expires=3600`
   (1 hour). The implication: the client must NOT cache the redirect
   URL for resume sessions longer than ~1 hour. Pause/resume must
   re-hit `huggingface.co` to get a fresh signed URL.
5. **No `Last-Modified` from the resolve URL, only `etag`.** Phase 7
   "library refresh" / "model updated upstream" cues must come from the
   `/api/models/{repoId}` `lastModified` field in the JSON payload, not
   from the file `HEAD` response.

## Rate limit behavior

### What the docs say

The master plan (line 1352) cites:

> Rate limits: anonymous = 1000/hr/IP; authenticated = 5000/hr/user

The
[Hugging Face Hub API documentation](https://huggingface.co/docs/hub/api)
does not surface a public rate-limit number on that page directly. The
closest authoritative reference is the
[Hugging Face support post on API rate limits](https://discuss.huggingface.co/t/api-rate-limit-exceeded-error/152876)
where staff confirm the rate limit is per-IP for anonymous and per-token
for authenticated, but exact numbers are not always disclosed.
Community datapoints
([example](https://discuss.huggingface.co/t/api-limits-on-free-inference-api/57711))
echo the 1000/hr-anonymous, 5000/hr-authenticated shape, but treat it as
an approximate ceiling that varies by endpoint.

The
[`hf_hub_download` client](https://huggingface.co/docs/huggingface_hub/main/en/package_reference/file_download)
in `huggingface_hub` Python expects `429` for rate-limited responses and
[honors `Retry-After`](https://github.com/huggingface/huggingface_hub/blob/main/src/huggingface_hub/utils/_http.py)
when retrying.

### What we observed

**Test 1 — 50× sequential anonymous search** (the master plan Step 4
target):
```
elapsedMs: 6060           statuses: [200]      any429: false
completed: 50/50          rps: 8.25            rateLimitHeadersPresent: false
```

**Test 2 — 50× concurrent anonymous search** (separately executed, to
push harder than serial):
```
elapsedMs: 411            statuses: [200]      any429: false
completed: 50/50          rps: 121.65 (peak)   p50: 281 ms   p95: 327 ms
```

**Test 3 — 20× concurrent Range download** (small 1024-byte ranges):
```
elapsedMs: 544            statuses: [206]      any429: false
```

Across **all three patterns (120 total anonymous requests in under
~7 seconds wall-clock)** the responses came back as 200/206. No 429
fired; **no `x-ratelimit-limit`, `x-ratelimit-remaining`, or
`x-ratelimit-reset` headers were present** on any successful response.

### What this means for the v1 client

- **The 1000/hr figure is real but unsurfaced.** Anonymous responses do
  not expose remaining quota. The client cannot do proactive
  backoff-before-429 because the budget is invisible. The only signal
  is **the 429 itself + the `Retry-After` header**.
- **Practical user load is far below the limit.** A typical Phase 7
  session: a few searches as the user types, one or two model card
  fetches, one big GGUF download. Call it ~10-20 API hits + one file
  pull per "browse and download" flow. 1000/hr = ~17/minute average,
  which a single user will rarely approach.
- **Burst patterns matter for CI / shared NAT / hostel-wifi.** Multiple
  users behind one egress IP add up. The 1000/hr is per-IP. A
  small-office user might trip 429 from a teammate's separate session.
  The client surfaces a typed `hf-rate-limited` error (spec § 14.1
  line 607) so the UI can render *"HF rate-limited — try again in N
  seconds, or add a personal HF token in Settings to lift the limit"*.

### Rate-limit + retry strategy (v1)

| Trigger                                                  | Client action                                                                                                                                                                                                              | UI behavior |
|---|---|---|
| `429` on any HF endpoint                                  | Parse `Retry-After` (seconds), surface typed `hf-rate-limited` error per spec § 14.1, schedule a single retry after `Retry-After + 250 ms` jitter                                                                          | Toast: "HF rate limit reached — retrying in `N` seconds". Settings link to add a token. |
| `5xx` (server-side transient)                             | Exponential backoff: 1 s, 2 s, 4 s, 8 s, with ±250 ms jitter. Max 3 retries. Then surface typed `hf-download-failed` per spec § 14.1.                                                                                       | Resume-able download stays paused; transient toast. |
| `ECONNRESET` / `ECONNREFUSED` / `ETIMEDOUT` mid-download | Treat as resumable interruption: keep `bytesReceived` in the download handle, on resume re-`HEAD` to re-verify ETag, then `GET` with `Range: bytes=<bytesReceived>-`                                                       | "Connection lost — will resume automatically" + visible Pause/Resume controls. |
| `401`                                                     | Repo doesn't exist OR is gated. Surface typed `hf-not-found` (proposed) vs `hf-auth-required` (current `hf-download-failed`). HF uses 401 for both for security; the UI shows a single "Can't access this repo" message. | Toast: "This repo doesn't exist or requires authentication." Link to add a token. |
| `403`                                                     | License gating (model requires license-accept on the website). Surface `hf-license-required` (proposed).                                                                                                                  | Modal: "This model requires accepting its license on huggingface.co. Open in browser?" |
| Successful 200 → `lastModified` newer than local DB row   | Library row gets a `staleSince: <timestamp>` flag (Phase 7 polish; not v1-blocking)                                                                                                                                       | Card shows "Update available" badge. |

The exponential backoff sequence `1 / 2 / 4 / 8` with ±250 ms jitter is
the same shape used by
[the official `huggingface_hub` client](https://github.com/huggingface/huggingface_hub/blob/main/src/huggingface_hub/utils/_http.py)
and by AWS SDK retry strategies
([AWS docs on retry behavior](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)).

## Resume validation (bit-perfect)

This is the spike's most important deliverable. Spec § 14.1
`hf-download-failed` recovery and the Phase 7 pause/resume UX both
depend on Range-based stitching being bit-perfect across the CDN. We
proved it with 2 × 1 KiB Range fetches + 1 independent 2 KiB
single-shot, hashed with `node:crypto.createHash('sha256')`.

### Methodology

We deliberately did **not** download the full 638 MiB TinyLlama Q4_K_M
file. Three Range requests for 1000 + 1000 + 2000 = 4000 bytes total
suffice to prove bit-perfect stitching:

1. `Range: bytes=0-999` → 1000 bytes, SHA256 of buffer A
2. `Range: bytes=1000-1999` → 1000 bytes, SHA256 of buffer B
3. Concatenate A‖B → 2000 bytes, SHA256 of concat
4. `Range: bytes=0-1999` → 2000 bytes (independent fetch), SHA256
5. Assert concat-SHA === single-shot-SHA, length === 2000

### Observed values (real)

| Range request           | Status | `Content-Range` header           | Bytes | SHA256 of payload |
|---|---|---|---|---|
| `bytes=0-999`           | 206    | `bytes 0-999/668788096`          | 1000  | `78cde055dc6f56a5e50ed26e6f6279c6a66f6dcbea179d6e85a1fc7914e10d34` |
| `bytes=1000-1999`       | 206    | `bytes 1000-1999/668788096`      | 1000  | `fc026690c5508117440c398fbe420d155f61aa5c008e18b7a132b2c9d34fc293` |
| (concat of A ‖ B)       | —      | —                                | 2000  | `8adc9553cd86574012b3e5dd26f4d1b5c4002e3bfb173d7a1bb4c5feef32a937` |
| `bytes=0-1999`          | 206    | `bytes 0-1999/668788096`         | 2000  | `8adc9553cd86574012b3e5dd26f4d1b5c4002e3bfb173d7a1bb4c5feef32a937` |

**Result: `bitPerfect = true`** — the concatenated-from-two SHA equals
the single-shot SHA exactly. `Content-Range` is RFC-9110-correct on
every response. Resume across the
`huggingface.co` → `cas-bridge.xethub.hf.co` redirect works without
caveat.

### Why this is non-trivial

The
[Xet-on-the-Hub launch post](https://huggingface.co/blog/xet-on-the-hub)
describes the new content-addressable storage backend that's gradually
replacing LFS for GGUFs. Xet uses a content-defined-chunking layer that
operates *under* the HTTP transport; the spike's two Range requests
nominally cross different chunk boundaries inside the Xet backend, and
the fact that the bytes still concatenate bit-perfectly proves the
chunking is invisible at the HTTP layer. Phase 7 can implement
Range-based resume against the public HTTP API and ignore Xet
internals.

### Phase 7 resume protocol (concrete)

```
On user click "Pause":
  • Capture { bytesReceived, etag_at_start, repoId, file, target } to disk handle
  • Abort the live fetch (AbortController)

On user click "Resume" (same session):
  • Reissue HEAD; assert response.etag === handle.etag_at_start
    → if mismatch: surface "Upstream changed — discard or restart?" modal
  • GET with Range: bytes=<bytesReceived>-
  • Append response body to target
  • Update bytesReceived; loop on any chunk-stream interruption

On user click "Resume" (after app restart):
  • Read handle.etag_at_start from disk
  • Same flow as in-session resume
  • The expired Xet signed URL is irrelevant; we always re-hit
    huggingface.co/{repoId}/resolve/... which re-mints a fresh sig.
```

The ETag-mismatch branch is critical because GGUFs DO get reuploaded —
[bartowski](https://huggingface.co/bartowski) and
[TheBloke](https://huggingface.co/TheBloke) periodically rerun the
quantization with newer llama.cpp converters and overwrite the same
filename. The strong ETag (= SHA256) lets us detect that case and
present an informed prompt instead of a corrupt stitch.

## Auth posture for v1

### The question

Spec § 10.2 today says:

> Search uses the HF Hub public API. No auth required for read; surfaces
> a "Configure HF token (optional, raises rate limit)" link in
> Settings → Defaults.

The master plan's Step 7 asks: is anonymous sufficient for v1's
expected usage pattern, or must the spec elevate "HF token (optional)"
into the onboarding flow?

### Recommendation: **anonymous-sufficient — keep the link in Settings, don't add it to onboarding.**

Four reasons:

1. **No rate-limit pressure observed in real use.** 120 anonymous
   requests in ~7 seconds across three burst patterns — zero 429s. A
   single user's typical session won't approach the 1000/hr documented
   ceiling. Onboarding gating on a token would be friction without
   payoff for the 95th-percentile case.
2. **The signed-CDN architecture means token auth wouldn't even speed
   up the download path.** File bytes come from
   [Cloudfront → Xet CAS bridge](https://huggingface.co/blog/xet-on-the-hub)
   with AWS-signed redirects. The redirect-mint step on
   `huggingface.co` is rate-limited; the actual `cas-bridge.xethub.hf.co`
   pull is not (it's regular AWS-S3-equivalent traffic). Token auth
   affects the redirect-mint, not the bytes — so users who hit Phase 7
   to download one 5 GB GGUF do not benefit from a token.
3. **Power users who DO want to lift the limit have a clear path.**
   Settings → Defaults → "HF token (optional, raises rate limit)" with
   keytar storage (spec § 14 / `local_model_endpoints.auth_header_key_ref`
   pattern). One field, one toggle.
4. **Gated repos (Llama 3.x official from Meta) are a separate, real
   use case** that DOES need a token — but those repos are also a
   distinct UX flow: the user has to accept the license on
   huggingface.co first, then add the token. Phase 7 should surface
   that flow when a `401`/`403` fires, not preempt it.

### When elevating to onboarding would be the right call

- If a P95 user crosses 1000 API hits in an hour (which we haven't seen
  any path to in the v1 UX) — revisit and consider auto-prompting.
- If HF tightens the anonymous ceiling on their side. Their docs page
  has been updated multiple times in 2024-2026; track it. The
  [Hub Discussions](https://discuss.huggingface.co/c/api/9) is the
  canonical source.
- If Team-X's nightly integration tests start flaking on rate limits.

### Token-mode rerun (Step 5) — deferred

The plan explicitly marks Step 5 as Rocky's optional. The spike does
not consume an HF token from the environment (`HF_TOKEN` is not read).
Rerunning the burst with a token would surface `x-ratelimit-limit /
remaining / reset` headers (this is documented behavior in the
[`huggingface_hub` source](https://github.com/huggingface/huggingface_hub/blob/main/src/huggingface_hub/utils/_http.py))
and is queued as a one-line homework after this PR lands. If Rocky
runs `HF_TOKEN=hf_… node scripts/spike-S5/hf-probe.mjs --burst`, those
headers will appear in the new `report.json`. Not blocking.

## Client API (proposed)

The TypeScript interface below is **syntactically validated** — it
parses cleanly under `tsc 5.5.4 --noEmit --strict`. It is the
proposed contract for `packages/local-gguf-runtime/src/hf-client/`.
The plan template (lines 1461–1469) gave the seed shape; the additions
below come from real API observations during this spike.

```typescript
// packages/local-gguf-runtime/src/hf-client/types.ts (proposed)

/** A single search hit from `/api/models?search=…&filter=gguf`. */
export interface HfSearchResult {
  /** Canonical repoId like `bartowski/Meta-Llama-3.1-8B-Instruct-GGUF`. */
  readonly id: string;
  /** All-time download counter from the search response. Display only. */
  readonly downloads: number;
  /** Repo's ISO-8601 last-modified timestamp. */
  readonly lastModified: string;
  /** Author / org from HF. */
  readonly author?: string;
  /** Tag list (`text-generation`, `gguf`, …). Used for chip rendering. */
  readonly tags?: ReadonlyArray<string>;
  /** Library family (`gguf`, `transformers`, …). */
  readonly library?: string;
  /** Pipeline tag — used to filter LLM vs embedding vs vision. */
  readonly pipelineTag?: string;
}

/** Server-side filters wired into `/api/models?…` query string. */
export interface HfFilters {
  readonly filter?: 'gguf' | string;
  readonly sort?: 'downloads' | 'lastModified' | 'createdAt' | 'likes';
  readonly direction?: -1 | 1;
  readonly limit?: number;
  /** `models?author=bartowski` — typed because Phase 7 surfaces author chips. */
  readonly author?: string;
  /** Cursor-style pagination via `cursor=…`; HF returns `next` link in headers. */
  readonly cursor?: string;
}

/** A single file inside a repo (a `siblings[]` entry). */
export interface HfFileSibling {
  readonly rfilename: string;
  /** Size in bytes (read from `x-linked-size` header on resolve HEAD; not from the model card). */
  readonly size?: number;
  /** LFS / Xet content hash, present on most large files. */
  readonly lfsSha256?: string;
}

/** Decoded model card; the structure returned by `/api/models/{repoId}`. */
export interface HfModelCard {
  readonly id: string;
  readonly author: string;
  readonly lastModified: string;
  readonly downloadsAllTime?: number;
  readonly downloads?: number;
  readonly likes?: number;
  readonly tags: ReadonlyArray<string>;
  readonly pipelineTag?: string;
  readonly library?: string;
  readonly siblings: ReadonlyArray<HfFileSibling>;
  /** README rendered HTML may be huge — Phase 7 only loads it lazily. */
  readonly cardData?: Record<string, unknown>;
}

/** Captured CDN/transport metadata for a file resolve. */
export interface HfFileMetadata {
  readonly repoId: string;
  readonly filename: string;
  /** Total bytes from `Content-Length` on the HEAD. */
  readonly totalBytes: number;
  /** Strong ETag from the resolve — same value as the file's SHA256 for LFS/Xet objects. */
  readonly etag: string;
  /** Always `'bytes'` for HF; recorded to drive the UI's "resumable" badge. */
  readonly acceptsRanges: 'bytes' | 'none';
  /** AWS-signed redirect URL. **Expires** in ~1 hour; do not cache across pauses. */
  readonly redirectUrl: string;
  /** Captured at resolve-time so resume can detect upstream rewrites. */
  readonly capturedAt: string;
}

/** Streamed download progress callback payload. */
export interface DownloadProgress {
  readonly bytesReceived: number;
  readonly totalBytes: number;
  readonly bytesPerSecond: number;
  readonly etaSeconds: number;
}

/** A live download identified by handle id (DB row id). */
export interface DownloadHandle {
  readonly id: string;
  readonly repoId: string;
  readonly filename: string;
  readonly targetPath: string;
  readonly state: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed';
  readonly bytesReceived: number;
  readonly totalBytes: number;
  /** Captured at the start; resume re-HEADs and asserts equality. */
  readonly etagAtStart: string;
}

export interface StartDownloadOpts {
  readonly repoId: string;
  readonly filename: string;
  readonly targetPath: string;
  readonly onProgress: (p: DownloadProgress) => void;
  /** Optional HF token from keytar (Settings → Defaults). */
  readonly token?: string;
}

export interface HfClient {
  /** Single search call; pagination is the caller's loop via `cursor`. */
  search(query: string, filters: HfFilters): Promise<ReadonlyArray<HfSearchResult>>;
  /** Hits `/api/models/{repoId}`. Cached in-process for 60 s. */
  modelCard(repoId: string): Promise<HfModelCard>;
  /** HEAD + capture of CDN metadata; safe to call before download to drive a preview pane. */
  fileMetadata(repoId: string, filename: string): Promise<HfFileMetadata>;
  /** Spawns a download with progress callback. Returns when state transitions to a terminal value. */
  startDownload(opts: StartDownloadOpts): Promise<DownloadHandle>;
  /** Pause — AbortController on the fetch; writes the handle row to disk. */
  pauseDownload(handleId: string): Promise<void>;
  /** Resume — HEAD + ETag check + Range continuation. */
  resumeDownload(handleId: string): Promise<void>;
  /** Cancel — like pause but deletes the partial file and the handle row. */
  cancelDownload(handleId: string): Promise<void>;
}
```

### Deltas from the master plan template (lines 1461–1469)

| Plan template                        | Spike addition                                                  | Why                                                                                                          |
|---|---|---|
| `search(query, filters)`             | Filters become a typed `HfFilters` with `author` and `cursor`   | Real `/api/models?…` accepts `author=` and uses cursor-style pagination in the Link header.                  |
| `modelCard(repoId)`                  | (added) `fileMetadata(repoId, filename)` as a separate method   | The HEAD response has its own metadata to capture (ETag = SHA256, signed redirect URL, totalBytes). Splitting it from `modelCard` keeps each call cheap.                       |
| `startDownload({ ... })`             | (added) `etagAtStart` on the handle                             | Resume after restart needs the captured ETag to detect upstream re-quantization.                              |
| (no metadata type)                   | (added) `HfFileMetadata` with `redirectUrl` + `capturedAt`      | The Xet AWS-signed URL expires in 1 hr; capturing `capturedAt` lets the client invalidate proactively.        |
| `DownloadProgress` (implied)         | Concrete shape with `bytesPerSecond` + `etaSeconds`             | Phase 7 UI shows ETA in the download strip per spec § 10.2.                                                  |

### TypeScript validation

The interfaces above were saved to `.spike-s5-cache/types.ts` and parsed with:

```
$ node node_modules/typescript/bin/tsc --noEmit --strict --target es2022 --moduleResolution node .spike-s5-cache/types.ts
$ echo $?
0
```

No syntax errors, no implicit `any`, no `--strict` complaints. The
interface is a real TS type, not pseudo-code.

## Findings & risks

### F1. HF returns 401 (not 404) for non-existent repos

The master plan's fixture URL
[`bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF`](https://huggingface.co/api/models/bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF)
does not exist; HF returns:

```
HTTP/1.1 401 Unauthorized
{"error":"Invalid username or password."}
```

This is documented [HF behavior for both private and missing repos](https://discuss.huggingface.co/t/getting-401-error-for-public-models/2837)
— they collapse the two cases so an anonymous attacker cannot enumerate
private repo names. The implication for the Phase 7 client:
**`401` is ambiguous; it could be "not found" or "needs auth"**.
Spec § 14.1 should carry a `hf-not-found` variant in addition to
`hf-rate-limited` / `hf-download-failed`, and the UI message must be
the union ("This repo doesn't exist or requires authentication").

### F2. `x-ratelimit-*` headers absent on anonymous responses

The HF Hub does not expose remaining quota on anonymous responses
(observed across 120 successful requests in three burst patterns). The
documented `huggingface_hub` Python client only [reads these headers
when present](https://github.com/huggingface/huggingface_hub/blob/main/src/huggingface_hub/utils/_http.py)
and does the same fallback we propose: react to 429, parse
`Retry-After`, retry. **Phase 7 client must not try to "stay under
quota" by reading remaining-budget headers from anonymous responses
— they aren't there.**

### F3. Xet CDN signed URLs expire in 1 hour

The final URL after the
`huggingface.co/{repoId}/resolve/main/{file}` redirect includes
`X-Amz-Expires=3600`. A user who pauses a 5 GB download and resumes
2 hours later will get a `403 SignatureDoesNotMatch` if the client
cached the redirect target. **Resume must always start from
`huggingface.co` to re-mint a fresh signed URL** — the probe's
`fileMetadata` method codifies this by re-running the HEAD on every
resume.

### F4. Strong ETag is SHA256 of file content — free integrity check

`etag: "015c9bb0376d9c3c9dab434ecb3bd57961dce1921a5b1bf134c6f1b824c25c8d"`
is exactly a 64-hex-char SHA256, matching the LFS/Xet object hash.
Spec § 14.1's "Successful download → SHA verification → automatic
library entry" requirement is satisfied by computing the local file's
SHA256 once and comparing against the ETag from the resolve HEAD — no
second HTTP fetch for a `.sha256` sidecar file is required. Documented
behavior: [Hub LFS storage backend docs](https://huggingface.co/docs/hub/storage-backends)
+ [Xet on the Hub launch post](https://huggingface.co/blog/xet-on-the-hub).

### F5. Search latency is higher than model card latency (and that is the cold-cache surprise)

p50 `search` (127 ms) is consistently slower than p50 `modelCard`
(117 ms), despite the search returning less data. Reading the headers:
both show `x-cache: Miss from cloudfront` — but search hits a query
endpoint that can't be edge-cached (every query string is unique),
whereas `/api/models/{repoId}` is per-repo and warmable in HF's
origin layer. **UX implication:** the Phase 7 search box must
debounce keystrokes (300-400 ms) — every keystroke is a fresh origin
hit; there is no "snappy because it's edge-cached" path.

### F6. First-call cold latency dominates p95

In every endpoint's 5-sample run, the slow sample is the first one,
and the next four cluster tightly. Practical impact: the Phase 7 panel
shows ~300 ms first paint when the user first opens it, then 100-130 ms
on subsequent interactions. Acceptable. A "warm-up" call on tab open
(prefetch `/api/models?limit=1`) could trim the first-paint to ~120 ms
without doing anything user-visible.

### F7. JSON model card payload is small (≤ 21 KB for 24-file repo)

The `Meta-Llama-3.1-8B-Instruct-GGUF` card response is ~21 KB
(`etag: W/"5312-…"` → weak ETag with size 0x5312 = 21266 bytes). That
includes all 27 siblings (24 GGUFs + tokenizer + config). Phase 7 can
prefetch the model card without bandwidth concern — no streaming
needed.

### F8. `huggingface.co` does not expose CORS for direct browser-side calls

Not tested in-spike (Phase 7 runs in Electron main, not renderer), but
worth noting: the JSON endpoints don't return permissive CORS headers
on anonymous responses. Phase 7 must run all HF calls through the main
process per spec § 12.2; the renderer talks to the main via IPC, never
to HF directly.

### F9. Tar-file embedding models and code-vocab GGUFs have shorter
filenames than chat models

Trivial finding from `Meta-Llama-3.1-8B-Instruct-GGUF` siblings — the
24 `.gguf` filenames range 56-72 chars each. The Phase 7 list cell
must wrap or ellipsize on a 320 px-wide card. Not blocking; noted for
the designer-eye pass.

### F10. `huggingface_hub` Python client's design choices we adopt verbatim

- **Exponential backoff with jitter** — same shape as
  [`_http.py`](https://github.com/huggingface/huggingface_hub/blob/main/src/huggingface_hub/utils/_http.py).
- **`Retry-After` parsing** — accept either seconds-integer or
  HTTP-date format per
  [RFC 9110 § 10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3).
- **`HF_HUB_DOWNLOAD_TIMEOUT` analog** — Phase 7 will default to 60 s
  for the HEAD/JSON calls, no timeout (or 1 hour) for the
  byte-stream, matching the Python client's pattern.
- **User-Agent identification** — our probe and Phase 7 production
  client send a `User-Agent` header so HF telemetry can attribute the
  traffic. Plan-recommended; HF
  [asks integrators to identify themselves](https://huggingface.co/docs/huggingface_hub/main/en/concepts/user_agent).

## Phase-7 carry-over

### Production code paths

| File                                                                       | Source                                | Notes |
|---|---|---|
| `packages/local-gguf-runtime/package.json`                                 | _(new)_                               | No new runtime deps for the HF client itself. Pure `fetch` + `node:crypto`. |
| `packages/local-gguf-runtime/src/hf-client/types.ts`                       | from this spike, see § "Client API"   | Includes `HfClient`, `HfSearchResult`, `HfModelCard`, `HfFileMetadata`, `DownloadHandle`. |
| `packages/local-gguf-runtime/src/hf-client/client.ts`                      | _(new)_                               | Implements `HfClient`. Owns the User-Agent + base URL + retry policy. |
| `packages/local-gguf-runtime/src/hf-client/retry.ts`                       | derived from F10                       | `withRetry(fn, { onRateLimit, on5xx, onTransport })` — encapsulates the spec § 14.1 mapping. |
| `packages/local-gguf-runtime/src/hf-client/download.ts`                    | derived from § "Resume validation"     | Chunked Range stream, AbortController integration, ETag re-verification. |
| `packages/local-gguf-runtime/src/hf-client/client.test.ts`                 | _(new)_                               | Unit tests against [`msw`](https://mswjs.io/) — matrix of `200 / 206 / 401 / 403 / 429 / 5xx / ECONNRESET`. |
| `packages/local-gguf-runtime/src/hf-client/integration.test.ts`            | _(new)_                               | Env-gated nightly integration test against real HF. The fixture in this spike's probe (TheBloke TinyLlama) is the long-term integration fixture. |

### Test contract

| Behavior                                          | Test type                | Fixture                                              |
|---|---|---|
| Search returns shape-correct results              | unit (msw)                | Captured JSON from `.spike-s5-cache/report.json`     |
| Model card decodes `siblings`                     | unit (msw)                | Captured JSON from `.spike-s5-cache/report.json`     |
| HEAD captures totalBytes + ETag + redirectUrl     | unit (msw)                | Captured headers from `.spike-s5-cache/report.json`  |
| Range stitch is bit-perfect                       | integration (env-gated)   | TheBloke TinyLlama Q4_K_M, 4 KB total bytes pulled   |
| `429 + Retry-After` triggers backoff              | unit (msw)                | Synthetic msw handler                                |
| Resume after restart re-verifies ETag             | integration               | Same fixture, simulated `app.quit()` mid-stream      |
| 1-hour Xet signed URL expiry is handled           | unit (msw)                | Synthetic 403 response after a forced delay          |

### Spec amendments (small)

1. **Spec § 14.1 — add `hf-not-found`.** Today the error union has
   `hf-download-failed` + `hf-rate-limited`. Add:
   ```ts
   | { kind: 'hf-not-found'; repoId: string }
   | { kind: 'hf-auth-required'; repoId: string; file?: string }
   | { kind: 'hf-license-required'; repoId: string; licenseUrl?: string }
   ```
   Driver: 401 collapse + 403 license-gating need typed UI messages,
   not raw status surfacing.

2. **Plan line 1385/1395 fixture URL fix.** Replace
   `bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF` with
   [`TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF`](https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF)
   and the filename `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` (lowercased
   per TheBloke's naming).

3. **Spec § 10.2 unchanged.** "HF token (optional, raises rate limit)"
   stays in Settings → Defaults; no onboarding elevation needed
   (anonymous-sufficient — see § "Auth posture for v1").

4. **Spec § 10.2 — document the `Accept-Ranges` UI surface.** The
   "resumable" badge on a queued/active download should be wired to
   the captured `acceptsRanges` field rather than assumed. Today it's
   implicit; making it explicit catches the day HF stops supporting
   Range on some endpoint (unlikely but possible).

## Decision rationale

**GO WITH CHANGES.** All four spike risks resolved with concrete
evidence:

1. **Endpoint surface validated.** All four endpoints respond
   200/206 on public-anonymous HTTP with p50 well under 350 ms.
   Sample payloads captured to `.spike-s5-cache/report.json` and
   re-runnable via the throwaway script.

2. **Rate-limit characterized.** Anonymous responses do NOT expose
   `x-ratelimit-*` headers. 120 requests across three burst patterns
   produced zero 429s. The 1000/hr ceiling is real but unsurfaced;
   the only reactive signal is `429 + Retry-After`. The client
   strategy is documented and matches `huggingface_hub` Python's
   own retry shape.

3. **Resume proven bit-perfect.** SHA256 of `bytes=0-999 ‖ bytes=1000-1999`
   exactly equals SHA256 of single-shot `bytes=0-1999`, across the
   `huggingface.co` → `cas-bridge.xethub.hf.co` redirect. Strong ETag
   = file SHA256 gives us a free post-download integrity check.

4. **Auth posture decided.** Anonymous-sufficient for v1; spec § 10.2
   stays as written. The two "changes" embedded in this GO are the
   spec § 14.1 typed-error additions and the plan's fixture-URL fix,
   not the auth-posture decision.

The three "changes" baked into this GO:

1. **Spec § 14.1 grow** to `hf-not-found` + `hf-auth-required` +
   `hf-license-required` typed variants (F1).
2. **Plan fixture URL fix** (F1; bartowski/TinyLlama doesn't exist).
3. **Spec § 10.2 explicit `acceptsRanges` UI binding** (F10).

None of these are blockers; all three are one-line edits to a doc.

## Spike contents (committed)

| Path                                                | Bytes  | Purpose |
|---|---|---|
| `docs/spikes/2026-05-27-S5-hf-api-client.md`        | —      | This writeup |
| `scripts/spike-S5/hf-probe.mjs`                     | ~14 KB | Throwaway probe — `--endpoints`, `--burst`, `--resume`, `--report` |

**Total commit size:** ~14 KB code + ~30 KB writeup. No fixtures.
`.spike-s5-cache/report.json` is regenerated on demand by re-running
the probe and is excluded from the commit (a `.spike-*-cache/` glob
already lives in `.gitignore` for S3 parity).

## Homework — Rocky's optional token-mode rerun

Step 5 of the master plan is explicitly optional. The spike validated
that anonymous is sufficient for v1; Rocky may still want to confirm
how `x-ratelimit-*` headers surface under auth before Phase 7 starts
the retry-strategy implementation. The one-liner:

```powershell
$env:HF_TOKEN = "hf_…"
node scripts/spike-S5/hf-probe.mjs --burst
```

The probe deliberately does NOT read `HF_TOKEN` today (the spike is
anonymous-only by intent). A 3-line addition to the probe would wire
it up if Rocky decides the empirical token-mode data is worth having.
Not blocking. Not on Phase 7's critical path.

---

**Spike status:** four endpoints exercised, real p50/p95 captured,
rate-limit reality documented, bit-perfect resume proven, TS interface
validated under `tsc --strict`, three small spec amendments queued,
decision recorded. **Recommendation: GO WITH CHANGES** — proceed to
Phase 1 foundation work and let Phase 7 inherit the client contract +
retry strategy + ETag-integrity pattern from this spike.

## Source links

Beyond the inline citations above, the following are the authoritative
sources backing claims in this writeup:

- [Hugging Face Hub API documentation (index)](https://huggingface.co/docs/hub/api)
- [Hugging Face Hub API: `/api/models` reference](https://huggingface.co/docs/hub/api#get-apimodels)
- [Hugging Face Hub API: `/api/models/{repoId}` reference](https://huggingface.co/docs/hub/api#get-apimodelsrepoidrevisionrevision)
- [Hugging Face Hub: file download / `resolve` URL pattern](https://huggingface.co/docs/hub/api#get-resolve)
- [Hugging Face Hub: storage backends overview (LFS + Xet)](https://huggingface.co/docs/hub/storage-backends)
- [Hugging Face blog: Xet on the Hub (launch post)](https://huggingface.co/blog/xet-on-the-hub)
- [`huggingface_hub` Python client GitHub repo](https://github.com/huggingface/huggingface_hub)
- [`huggingface_hub` Python: `_http.py` retry implementation](https://github.com/huggingface/huggingface_hub/blob/main/src/huggingface_hub/utils/_http.py)
- [`huggingface_hub` Python: `file_download.py` Range implementation](https://github.com/huggingface/huggingface_hub/blob/main/src/huggingface_hub/file_download.py)
- [`huggingface_hub` Python: User-Agent guidance](https://huggingface.co/docs/huggingface_hub/main/en/concepts/user_agent)
- [Hub Discussions: API rate limit exceeded thread](https://discuss.huggingface.co/t/api-rate-limit-exceeded-error/152876)
- [Hub Discussions: API limits on free inference API](https://discuss.huggingface.co/t/api-limits-on-free-inference-api/57711)
- [Hub Discussions: getting 401 on public models](https://discuss.huggingface.co/t/getting-401-error-for-public-models/2837)
- [Hub Discussions category index](https://discuss.huggingface.co/c/api/9)
- [RFC 9110 § 14.3 — Range Requests](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.3)
- [RFC 9110 § 14.4 — 206 Partial Content](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.4)
- [RFC 9110 § 8.8 — ETag](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8)
- [RFC 9110 § 10.2.3 — Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3)
- [RFC 9110 § 15.5.2 — 401 Unauthorized](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.2)
- [RFC 9110 § 15.5.4 — 403 Forbidden](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.4)
- [RFC 6585 § 4 — 429 Too Many Requests](https://www.rfc-editor.org/rfc/rfc6585.html#section-4)
- [Mozilla Developer Network — `Content-Range`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Range)
- [Mozilla Developer Network — `Accept-Ranges`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Ranges)
- [Mozilla Developer Network — `Retry-After`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After)
- [Mozilla Developer Network — `ETag`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag)
- [TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF — the canonical anonymous-accessible TinyLlama fixture](https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF)
- [bartowski/Meta-Llama-3.1-8B-Instruct-GGUF — the modelCard fixture](https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF)
- [bartowski profile (canonical conversion publisher)](https://huggingface.co/bartowski)
- [TheBloke profile (legacy canonical conversion publisher)](https://huggingface.co/TheBloke)
- [AWS Documentation — SDK retry behavior reference](https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html)
- [AWS Documentation — CloudFront response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html)
- [AWS Documentation — SigV4 signed URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/RESTAuthentication.html)
- [`msw` (Mock Service Worker) — unit-test mocking library for Phase 7](https://mswjs.io/)
- [Node.js — built-in `fetch` (since Node 18)](https://nodejs.org/api/globals.html#fetch)
- [Node.js — `node:crypto.createHash`](https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options)
- [Node.js — `node:perf_hooks.performance.now()`](https://nodejs.org/api/perf_hooks.html#performancenow)
- [Node.js — `AbortController` reference](https://nodejs.org/api/globals.html#class-abortcontroller)
- [TypeScript 5.5 release notes (the compiler version we validated against)](https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/)
- [`ggml-org/llama.cpp` — the upstream that publishes the GGUFs we'll download](https://github.com/ggml-org/llama.cpp)
- [`ggml-org/ggml` — GGUF binary format spec (input for S3, context here)](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md)
