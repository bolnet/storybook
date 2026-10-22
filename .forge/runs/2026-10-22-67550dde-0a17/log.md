# Run log: 2026-10-22-67550dde-0a17

Written by forge after each task, not by an agent: what each finished task changed and which findings its judges deferred. A summary, not evidence: the diff is. The last 20 tasks, at most 8 KB.

## Task 001: Move the serialized-param merge into `code/core/src/manager-api/lib/url.ts` as an exported `mergeSerializedParams` that keeps a pair whose value is an empty string and still discards a pair whose key is empty, and have `getS...
- files changed: code/core/src/manager-api/lib/url.ts, code/core/src/manager-api/modules/url.ts, code/e2e-internal/unit/serialized-params.spec.ts
- tests added: none
- deferred findings (major and minor, not blocking):
  - [minor] code/core/src/manager-api/lib/url.ts: The one behavioural change in the move — `filter(([key, value]) => key && value)` relaxed to `filter(([key]) => key)` — carries no comment and no guard in the module's own vitest suite, who.
  - [minor] code/e2e-internal/unit/serialized-params.spec.ts: The only tests covering this pure string helper live in the Playwright browser tier and reach it through a caught dynamic import, although the module already has a vitest unit s.
