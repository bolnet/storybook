# Run log: 2026-11-01-54412281-efbc

Written by forge after each task, not by an agent: what each finished task changed and which findings its judges deferred. A summary, not evidence: the diff is. The last 20 tasks, at most 8 KB.

## Task 001: Stop code/core/src/manager-api/modules/url.ts dropping an args or globals pair whose value is the empty string when parseSerializedParam reads the pair list out of Storybook's address, so getStoryHrefs carries that pair into...
- files changed: code/core/src/manager-api/modules/url.ts, code/e2e-internal/isolation-mode-href.spec.ts
- tests added: none
- deferred findings (major and minor, not blocking):
  - [minor] code/e2e-internal/isolation-mode-href.spec.ts: argsPairs swallows a URL parse failure and returns [], so the table test's dropped-pair assertion passes vacuously for any href it cannot parse. (ev:finding/001/1/code_reviewer/0)
  - [minor] code/e2e-internal/isolation-mode-href.spec.ts: argsPairs and openStoryWithArgs are duplicated near-verbatim from code/e2e-internal/e2e/isolation-mode-args.spec.ts (lines 34-61) rather than shared. (ev:finding/001/1/code_reviewe.
