/**
 * Shared setup for the console jsdom suites — import FIRST in every
 * `@vitest-environment jsdom` test file in this directory.
 *
 * Registers the jest-dom matchers and an explicit `afterEach(cleanup)`:
 * the workspace vitest config runs with `globals: false`, so Testing
 * Library's automatic cleanup (which hooks a global `afterEach`) never
 * registers — without this, each render leaks into the next test's DOM
 * and same-label queries collide across tests.
 *
 * The `@vitest-environment jsdom` pragma itself cannot live here — it is
 * per-file — so each suite still carries it in its own header.
 */
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
