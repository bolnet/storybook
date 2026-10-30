#!/usr/bin/env bash
# forge's test command for this repository (forge.yaml build.test): Vitest for the react renderer
# (tests.acceptance_root is code/renderers/react/src), the way nx's own "vitest" target runs any
# package's suite (cd {projectRoot} && yarn vitest; see the vitest target in nx.json).
#
# The repository root's vitest.config.ts instead defines a Vitest *workspace*: dozens of projects
# (agent-eval, every renderer, every framework...). Loading that workspace - even to then filter
# with --project - makes Vitest evaluate every matched vitest.config.ts up front, including
# code/renderers/svelte/vitest.config.ts. That file imports the svelte-vite framework's CSF plugin,
# which imports `@storybook/svelte/internal/svelte-csf/transform` by package specifier; package-json
# "exports" resolution for a plain config-file import ignores vitest.shared.ts's custom "code"
# condition (the one that lets test *code* resolve workspace packages to source instead of dist), so
# it falls through to the "default" condition, `./dist/svelte-csf/compiler/transform.js` - a file
# this image's build step never produces for this image, since nothing exercises that renderer. That
# breaks loading the workspace regardless of which project ends up selected.
#
# Running the react renderer's own vitest.config.ts directly sidesteps the workspace file, and with
# it every other project's config, entirely. forge appends its reporter flags and the test files it
# wants run; they reach Vitest as "$@".
set -euo pipefail
cd "$(dirname "$0")/../code/renderers/react"
export NX_NO_CLOUD=true NX_DAEMON=false CI=true STORYBOOK_DISABLE_TELEMETRY=1
NODE_OPTIONS=--max_old_space_size=4096 exec yarn vitest run "$@"
