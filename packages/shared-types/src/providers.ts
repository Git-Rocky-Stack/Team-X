import type { ModelTier } from './roles.js';

export type PrivacyTier = 'local' | 'open-source-cloud' | 'proprietary-cloud';

export type ProviderKind =
  | 'ollama'
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'custom-openai';

export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  privacyTier: PrivacyTier;
  baseUrl?: string;
  enabled: boolean;
}

export interface ModelDescriptor {
  id: string;
  providerId: string;
  tier: ModelTier;
  contextWindow: number;
  supportsTools: boolean;
  costPer1kIn?: number;
  costPer1kOut?: number;
}
