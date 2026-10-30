#!/usr/bin/env bash
# forge's test command for this repository (forge.yaml build.test): the react renderer's plain
# unit tests (tests.acceptance_root is code/renderers/react/src), run through a standalone config
# (scripts/forge-vitest.config.ts) instead of any of the repository's own Vitest configs.
#
# Neither of those works for this image, which never compiles the monorepo (no package's `dist`
# exists):
#   - The repository root's vitest.config.ts defines a Vitest *workspace*: dozens of projects
#     (agent-eval, every renderer, every framework...). Loading that workspace - even to then
#     filter with --project - makes Vitest evaluate every matched vitest.config.ts up front,
#     including code/renderers/svelte/vitest.config.ts. That file imports the svelte-vite
#     framework's CSF plugin, which imports `@storybook/svelte/internal/svelte-csf/transform` by
#     package specifier; resolving a bare import from *inside a config file* never goes through
#     Vite's module graph, so vitest.shared.ts's custom "code" condition (the one that lets test
#     *code* resolve workspace packages to source instead of dist) never applies - it falls
#     through to the "default" condition, `./dist/svelte-csf/compiler/transform.js`, a file this
#     image never produces.
#   - The react renderer's own vitest.config.ts has the same problem one level down: it pulls in
#     `@storybook/addon-vitest`'s browser-mode plugin (for testing `.stories.*` files), whose
#     import graph reaches the same unbuilt svelte package the same way. It also needs a
#     `.storybook/` fixture directory that doesn't exist in this renderer at all.
#
# scripts/forge-vitest.config.ts avoids both: it only ever imports plain npm packages and relative
# files, so bundling it can't need another workspace package's dist. The plain `*.test.ts(x)`
# files it selects import workspace packages too (e.g. `storybook/internal/types`), but those
# imports are resolved while Vitest transforms the *test* files through Vite's module graph, which
# does apply the "code" condition and sends them to source.
set -euo pipefail
cd "$(dirname "$0")/.."
export NX_NO_CLOUD=true NX_DAEMON=false STORYBOOK_DISABLE_TELEMETRY=1
NODE_OPTIONS=--max_old_space_size=4096 exec yarn vitest run --config scripts/forge-vitest.config.ts "$@"
