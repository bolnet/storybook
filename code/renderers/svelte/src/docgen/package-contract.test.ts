// @vitest-environment node
import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

// The docgen engine and svelte2tsx share the project's `typescript`, as React and Vue do. A project
// on TypeScript 7 aliases `typescript` to `@typescript/typescript6`, which only works with a peer.
it('reads the TypeScript compiler API from the project', () => {
  expect(manifest.dependencies).not.toHaveProperty('typescript');
  expect(manifest.peerDependencies.typescript).toBe('^5.9.0 || ^6.0.0 || ^7.0.0');
  expect(manifest.peerDependenciesMeta.typescript).toEqual({ optional: true });
});
