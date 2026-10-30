import { resolve } from 'node:path';

import { defineConfig, mergeConfig } from 'vitest/config';

import { vitestCommonConfig } from '../code/vitest.shared.ts';

// forge's test command (forge.yaml build.test) needs a Vitest config that only ever imports
// plain npm packages and relative files - never a bare `storybook/*` or `@storybook/*` specifier -
// so that bundling *this config file* can never need another workspace package's `dist` (which
// this image never builds; see scripts/forge-vitest.sh). The repository's own configs don't have
// that property: the root workspace config (vitest.config.ts) loads every project's config up
// front, including the svelte renderer's, and the react renderer's own vitest.config.ts pulls in
// `@storybook/addon-vitest`'s browser-mode plugin for CSF story tests, whose import graph reaches
// the same unbuilt svelte package. Plain `*.test.ts(x)` files are unaffected either way: Vitest
// transforms them through Vite's module graph, which does honor vitestCommonConfig's `code`
// resolve condition and sends workspace-package imports to source instead of dist.
export default mergeConfig(
  vitestCommonConfig,
  defineConfig({
    test: {
      name: 'forge-react-renderer',
      root: resolve(import.meta.dirname, '..'),
      include: ['code/renderers/react/src/**/*.test.{ts,tsx}'],
      // Asserts the monorepo was compiled first (via `process.env.CI`), which this image's test
      // step never does.
      exclude: ['**/node_modules/**', 'code/renderers/react/src/dist-contract.test.ts'],
    },
  })
);
