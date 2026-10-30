#!/usr/bin/env bash
# forge's test command for this repository (forge.yaml build.test): Vitest from the repository root, as `yarn test`
# runs it. forge appends its reporter flags and the test files it wants run; they reach Vitest as "$@".
set -euo pipefail
cd "$(dirname "$0")/.."
export NX_NO_CLOUD=true NX_DAEMON=false CI=true STORYBOOK_DISABLE_TELEMETRY=1
# agent-eval's tailwindcss devDependency scans node_modules for content and chokes on the
# @storybook/svelte workspace symlink, whose dist this image's compile step doesn't produce; the
# Windows unit job excludes this project for the same kind of reason (scripts/ci/common-jobs.ts).
NODE_OPTIONS=--max_old_space_size=4096 exec yarn vitest run --project '!agent-eval' "$@"
