#!/usr/bin/env bash
# forge's test command for this repository (forge.yaml build.test): Vitest from the repository root, as `yarn test`
# runs it. forge appends its reporter flags and the test files it wants run; they reach Vitest as "$@".
set -euo pipefail
cd "$(dirname "$0")/.."
export NX_NO_CLOUD=true NX_DAEMON=false CI=true STORYBOOK_DISABLE_TELEMETRY=1
NODE_OPTIONS=--max_old_space_size=4096 exec yarn vitest run "$@"
