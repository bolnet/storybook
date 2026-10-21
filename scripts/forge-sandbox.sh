#!/usr/bin/env bash
# forge's sandbox start (forge.yaml sandbox.start): compile what changed, then serve the internal Storybook
# (code/.storybook) on $PORT for browser acceptance tests, which reach it at FORGE_SANDBOX_URL.
set -euo pipefail
cd "$(dirname "$0")/.."
export NX_NO_CLOUD=true NX_DAEMON=false CI=true STORYBOOK_DISABLE_TELEMETRY=1
yarn task --task compile --start-from=auto --no-link
cd code
exec env NODE_OPTIONS=--max_old_space_size=4096 node core/dist/bin/dispatcher.js dev --port "${PORT:-6006}" --config-dir ./.storybook --ci --no-version-updates
