// Optional dependency. Loaded via dynamic import with a graceful char-count
// fallback in src/rag/chunker-v2.ts when the runtime module is unavailable.
declare module 'tiktoken/lite' {
  export interface Tiktoken {
    encode(text: string): Uint32Array;
    decode(tokens: Uint32Array): Uint8Array;
    free(): void;
  }
  export function getEncoding(name: string): Tiktoken;
}
