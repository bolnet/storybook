#!/usr/bin/env bash
# forge's test command for this repository (forge.yaml build.test): compile what changed, serve the internal Storybook
# (code/.storybook) and run the e2e-internal Playwright suite. forge appends its reporter flags and the spec files it
# wants run; they reach Playwright as "$@". Mirrors CI's "Internal storybook E2E" job (scripts/ci/common-jobs.ts).
set -euo pipefail
cd "$(dirname "$0")/.."
export NX_NO_CLOUD=true NX_DAEMON=false CI=true STORYBOOK_DISABLE_TELEMETRY=1
export STORYBOOK_URL=http://localhost:6006 STORYBOOK_TYPE=dev

yarn task --task compile --start-from=auto --no-link

cd code
server=""
if ! curl -fsS "$STORYBOOK_URL/index.json" > /dev/null 2>&1; then
  yarn storybook:ui --no-version-updates > /tmp/storybook-ui.log 2>&1 &
  server=$!
fi
yarn wait-on -t 600000 "$STORYBOOK_URL/index.json"

set +e
yarn playwright test -c e2e-internal/playwright.config.ts "$@"
status=$?
set -e
if [ -n "$server" ]; then kill "$server" 2> /dev/null || true; fi
exit "$status"
