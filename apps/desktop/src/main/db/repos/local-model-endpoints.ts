/**
 * Local model endpoints repository — remote LAN endpoints (LM Studio /
 * Ollama / llama-server / KoboldCPP / vLLM) for v3.3.0 local GGUF support
 * (spec § 7).
 *
 * `privacy_tier` is constrained to 'Local' at the SQL layer — these
 * endpoints are local-network, never cloud. Deleting an endpoint cascades
 * to any local_models rows that reference it (ON DELETE CASCADE).
 */

import type { EndpointStatus, RemoteEndpoint } from '@team-x/shared-types';
import { desc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

import type { Schema } from '../client.js';
import { localModelEndpoints } from '../schema.js';

export interface InsertEndpointInput {
  name: string;
  baseUrl: string;
  authHeaderKeyRef: string | null;
}

/**
 * Partial config update behind `localGguf.endpoint.update`.
 *
 * Each field is optional and "omitted" is distinct from "set to null":
 * omitting `authHeaderKeyRef` leaves the stored reference alone, while
 * passing `null` clears it. That distinction is why this is a
 * `key in input` check rather than a `?? existing` fallback.
 */
export interface UpdateEndpointConfigInput {
  name?: string;
  baseUrl?: string;
  authHeaderKeyRef?: string | null;
}

type EndpointsDb<TRunResult> = BaseSQLiteDatabase<'sync', TRunResult, Schema>;

function mapRow(row: typeof localModelEndpoints.$inferSelect): RemoteEndpoint {
  return {
    ...row,
    privacyTier: row.privacyTier as 'Local',
    status: row.status as EndpointStatus,
  };
}

export function createLocalModelEndpointsRepo<TRunResult>(db: EndpointsDb<TRunResult>) {
  function getById(id: string): RemoteEndpoint | null {
    const row = db.select().from(localModelEndpoints).where(eq(localModelEndpoints.id, id)).get();
    return row ? mapRow(row) : null;
  }

  function readBack(id: string): RemoteEndpoint {
    const row = getById(id);
    if (!row) throw new Error(`local_model_endpoints row ${id} not found after write`);
    return row;
  }

  return {
    /** Insert a new endpoint (status starts 'unknown') and return the stored row. */
    insert(input: InsertEndpointInput): RemoteEndpoint {
      const id = nanoid();
      const now = Date.now();
      db.insert(localModelEndpoints)
        .values({
          id,
          name: input.name,
          baseUrl: input.baseUrl,
          authHeaderKeyRef: input.authHeaderKeyRef,
          privacyTier: 'Local',
          status: 'unknown',
          lastCheckedAt: null,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return readBack(id);
    },

    /** Return the endpoint with a matching id, or null if none exists. */
    getById,

    /** Every endpoint, newest first. */
    list(): RemoteEndpoint[] {
      return db
        .select()
        .from(localModelEndpoints)
        .orderBy(desc(localModelEndpoints.createdAt))
        .all()
        .map(mapRow);
    },

    /** Record a reachability check result; stamps last_checked_at = now. */
    updateStatus(id: string, status: EndpointStatus, lastError: string | null): RemoteEndpoint {
      const now = Date.now();
      db.update(localModelEndpoints)
        .set({ status, lastCheckedAt: now, lastError, updatedAt: now })
        .where(eq(localModelEndpoints.id, id))
        .run();
      return readBack(id);
    },

    /** Rotate (or clear, with null) the keytar reference for the auth header. */
    updateAuthRef(id: string, ref: string | null): RemoteEndpoint {
      db.update(localModelEndpoints)
        .set({ authHeaderKeyRef: ref, updatedAt: Date.now() })
        .where(eq(localModelEndpoints.id, id))
        .run();
      return readBack(id);
    },

    /** Rename an endpoint. */
    rename(id: string, name: string): RemoteEndpoint {
      db.update(localModelEndpoints)
        .set({ name, updatedAt: Date.now() })
        .where(eq(localModelEndpoints.id, id))
        .run();
      return readBack(id);
    },

    /**
     * Apply a partial config change (name / baseUrl / authHeaderKeyRef) in a
     * single statement and return the stored row.
     *
     * `rename` and `updateAuthRef` remain for the narrow single-field call
     * sites, but the `localGguf.endpoint.update` channel accepts all three at
     * once. Composing the single-field writers would issue three write +
     * read-back round-trips and briefly persist a row carrying the new name
     * against the old URL, so this is one UPDATE.
     *
     * Unlike the single-field writers, an unknown id throws rather than
     * silently succeeding: the channel contract returns a `RemoteEndpoint`,
     * and there is no honest row to return for an endpoint that does not
     * exist.
     */
    updateConfig(id: string, input: UpdateEndpointConfigInput): RemoteEndpoint {
      if (!getById(id)) {
        throw new Error(`local_model_endpoints row ${id} not found`);
      }
      const patch: Partial<typeof localModelEndpoints.$inferInsert> = { updatedAt: Date.now() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl;
      // Explicit `in` check: `null` is a meaningful value here (clear the ref),
      // so `!== undefined` alone would be right but `in` also documents that
      // omission and null are deliberately different.
      if ('authHeaderKeyRef' in input) patch.authHeaderKeyRef = input.authHeaderKeyRef ?? null;

      db.update(localModelEndpoints).set(patch).where(eq(localModelEndpoints.id, id)).run();
      return readBack(id);
    },

    /**
     * Forget the last probe verdict: status back to 'unknown', with
     * `lastCheckedAt` and `lastError` cleared.
     *
     * Distinct from `updateStatus`, which always stamps `last_checked_at =
     * now` because it records the outcome of a probe that just happened.
     * Using it to mean "reset" would leave the contradictory row `status =
     * 'unknown'` alongside a check timestamp — never probed, yet checked at
     * 14:32. Called when an endpoint's `base_url` changes, since the stored
     * verdict describes the previous address.
     *
     * Throws on unknown id: the caller expects a row back and there is no
     * honest one to return.
     */
    clearStatus(id: string): RemoteEndpoint {
      if (!getById(id)) {
        throw new Error(`local_model_endpoints row ${id} not found`);
      }
      db.update(localModelEndpoints)
        .set({ status: 'unknown', lastCheckedAt: null, lastError: null, updatedAt: Date.now() })
        .where(eq(localModelEndpoints.id, id))
        .run();
      return readBack(id);
    },

    /**
     * Hard-delete an endpoint. Cascades to local_models rows referencing it
     * (ON DELETE CASCADE). No-op on unknown id.
     */
    remove(id: string): void {
      db.delete(localModelEndpoints).where(eq(localModelEndpoints.id, id)).run();
    },
  };
}

export type LocalModelEndpointsRepo = ReturnType<typeof createLocalModelEndpointsRepo>;
