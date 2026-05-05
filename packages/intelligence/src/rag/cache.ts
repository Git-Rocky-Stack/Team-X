/**
 * Query Cache for RAG Retrieval
 *
 * Caches query embeddings and retrieval results to reduce:
 * - Repeated embedding API calls
 * - Repeated vector similarity searches
 * - Database load for common queries
 *
 * Cache Strategy:
 * - Key: hash(companyId + query + options)
 * - TTL: 5 minutes (300,000ms)
 * - Invalidation: On content updates (via event bus)
 * - Storage: In-memory Map with LRU eviction
 */

import { createHash } from 'node:crypto';

/**
 * Cache entry with expiration.
 */
interface CacheEntry<T> {
  /** Cached value */
  value: T;

  /** When this entry expires (epoch ms) */
  expiresAt: number;

  /** When this entry was created (epoch ms) */
  createdAt: number;

  /** Number of times this entry was accessed */
  accessCount: number;

  /** Last access time (epoch ms) */
  lastAccessAt: number;
}

/**
 * Options for cache operations.
 */
export interface CacheOptions {
  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttl?: number;

  /** Maximum number of entries (0 = unlimited) */
  maxEntries?: number;

  /** Maximum size in bytes (0 = unlimited, approximate) */
  maxSizeBytes?: number;
}

/**
 * Retrieval options that affect cache key.
 */
export interface RetrievalOptions {
  /** Company ID for scoping */
  companyId: string;

  /** Top K for results */
  topK: number;

  /** Similarity threshold */
  threshold: number;

  /** Source types to include */
  sourceTypes?: string[];

  /** Exclude these source IDs */
  excludeSourceIds?: string[];
}

/**
 * Cached retrieval result.
 */
export interface CachedRetrieval {
  /** Retrieved documents */
  results: Array<{
    id?: string;
    sourceId: string;
    sourceType: string;
    chunkIndex: number;
    contentText: string;
    similarity: number;
  }>;

  /** Query embedding (for re-use) */
  queryEmbedding?: number[];

  /** When this was cached */
  cachedAt: number;

  /** Cache hit or fresh retrieval */
  hit: boolean;
}

/**
 * Statistics about cache performance.
 */
export interface CacheStats {
  /** Total number of entries in cache */
  entries: number;

  /** Total number of cache lookups */
  totalLookups: number;

  /** Number of cache hits */
  hits: number;

  /** Number of cache misses */
  misses: number;

  /** Hit rate (0-1) */
  hitRate: number;

  /** Number of evictions due to size/expiration */
  evictions: number;

  /** Number of invalidations */
  invalidations: number;

  /** Estimated memory usage in bytes */
  estimatedSizeBytes: number;
}

/**
 * Create a cache key from query and options.
 */
export function createCacheKey(query: string, options: RetrievalOptions): string {
  // Normalize query: lowercase, trim, collapse whitespace
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');

  // Create hash of normalized query + options
  const keyData = {
    q: normalized.slice(0, 200), // Truncate long queries
    c: options.companyId,
    k: options.topK,
    t: options.threshold,
    s: options.sourceTypes?.sort().join(',') || '',
    x: options.excludeSourceIds?.sort().join(',') || '',
  };

  const keyStr = JSON.stringify(keyData);
  return createHash('sha256').update(keyStr).digest('hex').slice(0, 16);
}

/**
 * LRU Cache implementation.
 */
export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private accessOrder: K[] = [];
  private readonly maxEntries: number;
  private readonly maxSizeBytes: number;
  private currentSizeBytes = 0;
  private evictions = 0;

  constructor(maxEntries = 1000, maxSizeBytes = 0) {
    this.maxEntries = maxEntries;
    this.maxSizeBytes = maxSizeBytes;
  }

  /**
   * Get a value from cache.
   * Returns null if not found or expired.
   */
  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.deleteInternal(key);
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessAt = Date.now();

    // Update access order (move to end)
    this.updateAccessOrder(key);

    return entry.value;
  }

  /**
   * Set a value in cache with TTL.
   */
  set(key: K, value: V, ttl: number): void {
    const now = Date.now();
    const size = this.estimateSize(value);

    // Delete existing entry if present
    if (this.cache.has(key)) {
      this.deleteInternal(key);
    }

    // Check size limits before inserting
    this.evictIfNeeded(size);

    const entry: CacheEntry<V> = {
      value,
      expiresAt: now + ttl,
      createdAt: now,
      accessCount: 0,
      lastAccessAt: now,
    };

    this.cache.set(key, entry);
    this.accessOrder.push(key);
    this.currentSizeBytes += size;
  }

  /**
   * Delete a specific key.
   */
  delete(key: K): boolean {
    if (!this.cache.has(key)) return false;

    this.deleteInternal(key);
    return true;
  }

  /**
   * Delete all entries matching a predicate.
   */
  deleteWhere(predicate: (key: K, value: V) => boolean): number {
    let deleted = 0;

    for (const [key, entry] of this.cache) {
      if (predicate(key, entry.value)) {
        this.deleteInternal(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.currentSizeBytes = 0;
    this.evictions = 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): {
    entries: number;
    evictions: number;
    estimatedSizeBytes: number;
  } {
    return {
      entries: this.cache.size,
      evictions: this.evictions,
      estimatedSizeBytes: this.currentSizeBytes,
    };
  }

  /**
   * Get all keys (for debugging/testing).
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Internal: delete a key and update size/access order.
   */
  private deleteInternal(key: K): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSizeBytes -= this.estimateSize(entry.value);
    }
    this.cache.delete(key);

    const index = this.accessOrder.indexOf(key);
    if (index >= 0) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Update access order for LRU.
   */
  private updateAccessOrder(key: K): void {
    const index = this.accessOrder.indexOf(key);
    if (index >= 0) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evict entries if size limit would be exceeded.
   */
  private evictIfNeeded(newSize: number): void {
    // Check entry count limit
    while (this.maxEntries > 0 && this.cache.size >= this.maxEntries) {
      const lruKey = this.accessOrder.shift();
      if (lruKey !== undefined) {
        this.deleteInternal(lruKey);
        this.evictions++;
      }
    }

    // Check byte size limit
    while (
      this.maxSizeBytes > 0 &&
      this.currentSizeBytes + newSize > this.maxSizeBytes &&
      this.accessOrder.length > 0
    ) {
      const lruKey = this.accessOrder.shift();
      if (lruKey !== undefined) {
        this.deleteInternal(lruKey);
        this.evictions++;
      }
    }
  }

  /**
   * Estimate size of a value in bytes.
   * This is a rough approximation.
   */
  private estimateSize(value: unknown): number {
    if (value === null || value === undefined) return 8;
    if (typeof value === 'string') return value.length * 2 + 8;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (Array.isArray(value)) return value.length * 64; // Rough estimate per item
    if (typeof value === 'object') {
      return Object.keys(value).length * 64 + 128; // Rough estimate
    }
    return 64; // Default fallback
  }
}

/**
 * Query cache for RAG retrieval.
 */
export class QueryCache {
  private cache: LRUCache<string, CachedRetrieval>;
  private totalLookups = 0;
  private hits = 0;
  private misses = 0;
  private invalidations = 0;

  constructor(options: CacheOptions = {}) {
    const { maxEntries = 1000, maxSizeBytes = 50 * 1024 * 1024 } = options; // 50MB default
    this.cache = new LRUCache(maxEntries, maxSizeBytes);
  }

  /**
   * Get cached retrieval results.
   */
  get(query: string, options: RetrievalOptions): CachedRetrieval | null {
    this.totalLookups++;

    const key = createCacheKey(query, options);
    const cached = this.cache.get(key);

    if (cached) {
      this.hits++;
      return { ...cached, hit: true };
    }

    this.misses++;
    return null;
  }

  /**
   * Set cache entry.
   */
  set(
    query: string,
    options: RetrievalOptions,
    results: CachedRetrieval['results'],
    ttl = 300000,
  ): void {
    const key = createCacheKey(query, options);
    const cachedAt = Date.now();

    this.cache.set(key, { results, cachedAt, hit: false }, ttl);
  }

  /**
   * Invalidate cache entries for a company.
   * Call this when content is added/updated/deleted.
   */
  invalidateByCompany(_companyId: string): number {
    const deleted = this.cache.deleteWhere(() => {
      // Key contains company hash, so we need to check by reconstructing
      // For simplicity, we'll clear all entries (could be optimized)
      return true; // Delete all for now
    });

    this.invalidations += deleted;
    return deleted;
  }

  /**
   * Invalidate cache entries for specific source IDs.
   * Call this when specific documents are updated.
   */
  invalidateBySourceIds(sourceIds: string[]): void {
    // Clear entire cache for simplicity
    // Could be optimized to only invalidate affected queries
    this.cache.clear();
    this.invalidations += sourceIds.length;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const internal = this.cache.getStats();

    return {
      entries: internal.entries,
      totalLookups: this.totalLookups,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.totalLookups > 0 ? this.hits / this.totalLookups : 0,
      evictions: internal.evictions,
      invalidations: this.invalidations,
      estimatedSizeBytes: internal.estimatedSizeBytes,
    };
  }

  /**
   * Reset statistics (keeps cache entries).
   */
  resetStats(): void {
    this.totalLookups = 0;
    this.hits = 0;
    this.misses = 0;
    this.invalidations = 0;
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * Clean up expired entries.
   * Normally handled automatically by get(), but can be called explicitly.
   */
  cleanupExpired(): number {
    const keys = this.cache.keys();
    let cleaned = 0;

    for (const key of keys) {
      const entry = this.cache.get(key);
      if (!entry) {
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Create a query cache with standard options.
 */
export function createQueryCache(options?: CacheOptions): QueryCache {
  return new QueryCache(options);
}
