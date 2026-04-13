# Configuring Providers

Team-X supports 10 LLM providers. This guide covers adding providers, setting privacy tiers, and choosing a runtime strategy.

## Supported Providers

| Provider | Privacy Tier | Notes |
|----------|-------------|-------|
| **Ollama** | Local | Runs on your machine. No data leaves your network. |
| **Anthropic** | Proprietary Cloud | Claude models (Opus, Sonnet, Haiku) |
| **OpenAI** | Proprietary Cloud | GPT-4o, GPT-4, GPT-3.5 |
| **Google** | Proprietary Cloud | Gemini models |
| **Groq** | Open-Source Cloud | Fast inference for open models |
| **OpenRouter** | Proprietary Cloud | Multi-model router |
| **Together** | Open-Source Cloud | Open model hosting |
| **Fireworks** | Open-Source Cloud | Fast open model inference |
| **OpenAI-Compatible** | Varies | Any endpoint with OpenAI-compatible API |

## Adding a Provider

1. Go to **Settings > Providers**
2. Click **Add Provider**
3. Select the provider type from the dropdown
4. Enter your **API key**
5. Optionally configure:
   - **Privacy tier** (Local, Open-Source Cloud, Proprietary Cloud)
   - **Base URL** (for OpenAI-compatible endpoints)
6. Click **Add**

Your API key is stored in the OS keychain (macOS Keychain, Windows Credential Manager, or Linux Secret Service). It never touches a config file.

## Testing a Connection

After adding a provider, click **Test Connection** on the provider card. Team-X sends a minimal request to verify the API key and endpoint are valid.

## Enabling/Disabling Providers

Toggle the switch on any provider card to enable or disable it. Disabled providers are never used by the agent runtime, even if they're the only option for a role's preferred provider list.

## Removing a Provider

Click the **Remove** button on a provider card. This deletes the provider configuration and removes the API key from the keychain.

## Privacy Tiers

Privacy tiers control which providers your agents are allowed to use. There are three tiers:

| Tier | Data Location | Example Providers |
|------|--------------|-------------------|
| **Local** | Your machine only | Ollama |
| **Open-Source Cloud** | Third-party servers, open models | Groq, Together, Fireworks |
| **Proprietary Cloud** | Third-party servers, proprietary models | Anthropic, OpenAI, Google |

### Setting a Privacy Maximum

In **Settings > Privacy**, set the maximum allowed tier:

- **Local only** — agents can only use Ollama. No data leaves your machine.
- **Open-Source Cloud** — agents can use local or open-source cloud providers.
- **Proprietary Cloud** — agents can use any provider (default).

The provider router enforces this filter at call time. If a role requests a proprietary provider but your privacy max is "local only," the router falls back per the role's `fallback_providers` list.

## Runtime Strategy

The runtime strategy determines how Team-X balances model quality, speed, and resource usage.

### Available Strategies

| Strategy | Behavior |
|----------|----------|
| **Auto** (default) | Profiles your hardware and providers on startup, picks the best strategy automatically |
| **Hybrid** | Uses local models for simple tasks, cloud models for complex ones |
| **Always-On** | Sends everything to the highest-quality available provider |
| **Lean** | Minimizes resource usage; prefers local models and fewer concurrent agents |

### Configuring

In **Settings > Runtime**:
1. View your **hardware profile** (CPU, RAM, GPU detected at startup)
2. Select a strategy from the dropdown, or leave it on Auto
3. The **effective slot count** shows how many agents can run concurrently under the selected strategy

### Concurrency Caps

In **Settings > Concurrency**, you can set:
- **Global orchestrator slots** — maximum total concurrent agent runs
- **Per-provider caps** — limit how many concurrent calls go to each provider

Default caps:

| Provider | Default Cap |
|----------|------------|
| Ollama | 1 |
| Anthropic | 4 |
| OpenAI | 6 |
| Google | 4 |
| Groq | 10 |
| OpenRouter | 8 |
| Together | 6 |
| Fireworks | 6 |

These defaults prevent overwhelming local hardware (Ollama) and respect API rate limits (cloud providers). Adjust based on your plan tier and hardware.
