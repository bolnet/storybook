# Keep empty-string args when a story opens in a new tab

## Purpose

**What goes wrong today** — Someone sets a story's text argument to empty (an empty label, an empty placeholder). The address bar records it correctly. The moment they open that story in a new tab with "Open in isolation mode", the empty argument disappears and the story comes up with its original value instead. The tab they opened, and the link they would share, shows a different story from the one they were looking at, and there is no way to hand someone a story with a deliberately empty string in it.

**What changes** — The link that opens a story in a new tab carries every argument that is in the current URL, including the ones whose value is an empty string. The new tab shows what the first tab showed.

**Who notices** — Anyone checking or sharing a component in a state where a string is intentionally empty: designers and reviewers opening a story in isolation, and anyone receiving such a link.

```flow
Person empties a text control -> Storybook writes the empty value into the address bar -> Person clicks Open in isolation mode -> Storybook builds the new tab link -> New tab shows the story with the value still empty
```

## Constraints

- The criteria are proven by the repository's own suite (`bash scripts/forge-e2e-internal.sh`), which serves the internal Storybook itself and runs Playwright; acceptance specs go directly under `code/e2e-internal`, not under an `e2e/` subdirectory.

- This is a reported defect (storybookjs/storybook#36356). The work is: make it behave as the issue says, and change nothing else anyone can see. No new options, no new UI, no change to how arguments are written into the address bar — that part already works.
- The serialized shape of the `args` query parameter does not change: pairs joined by `;`, key and value joined by `:`, values URI-encoded exactly as they are today. An empty value is the empty string after the `:` (`label:`), not a placeholder token.
- A pair with an empty **key** must still be discarded, so an empty or stray `args` parameter can never produce a bare `:` in a built link.
- The behaviour asserted by the existing manager-api URL tests (`code/core/src/manager-api/tests/url.test.js`, the `getStoryHrefs` cases around inheriting, merging, dropping on story change, and encoding) keeps its current expected values; those expectations are not to be relaxed to accommodate the fix.
- Assumption (owner, 2026-10-21), from forge's readiness file rather than from the person: acceptance tests are Playwright, live under `code/e2e-internal`, and run against the internal Storybook served at `STORYBOOK_URL` (default `http://localhost:6006`) by `bash scripts/forge-e2e-internal.sh`. No new service, account or network access is needed.
- Assumption (owner, 2026-10-21): the tests may use the internal Storybook's existing stories (`core-basics--basic`, `controls-basics--defined`) and must not add stories or fixtures to the product code to make themselves pass.

## Decisions and evidence

No question was put to the person: the issue states both what happens and what should happen, so the shape of the work is fixed by the report. Everything below was read from the repository at `forge-demo`.

**Where the value is lost.** `code/core/src/manager-api/modules/url.ts:42-50`, `parseSerializedParam`, splits the serialized parameter into pairs and ends with `.filter(([key, value]) => key && value)`. An empty-string value is falsy, so the whole pair is thrown away — the key goes with it. `mergeSerializedParams` (`url.ts:52-58`) is built on it and is what `getStoryHrefs` uses for both `args` (`url.ts:282`) and `globals` (`url.ts:285`) whenever `inheritArgs` / `inheritGlobals` are on. The link is assembled at `url.ts:299` and `url.ts:307-310`. This is the exact line the issue points at.

**The rest of the chain is already correct.** `buildArgsParam` (`code/core/src/router/utils.ts:189-217`) serializes `{ label: '' }` to `label:` — `validateArgs` accepts an empty string, and the `VALIDATION_REGEXP` is `/^[a-zA-Z0-9 _-]*$/`. `buildNavigationUrl` (`code/core/src/manager-api/lib/url.ts:6`) filters only `null` and `undefined`, so the empty value reaches the address bar. On the receiving side, `parseArgsParam` (`code/core/src/preview-api/modules/preview-web/parseArgsParam.ts:108-121`) turns `label:` back into `{ label: '' }`. So the empty argument survives everywhere except the merge above.

**Where a person sees it.** The "Open in isolation mode" toolbar button (`code/core/src/manager/components/preview/tools/share.tsx:84-115`) calls `api.getStoryHrefs(storyId, { base: 'origin', refId, inheritArgs: true })` and passes `previewHref` to `window.open(..., '_blank', 'noopener,noreferrer')`. The button is registered by default in `code/core/src/manager/container/Preview.tsx:22-29` and is labelled "Open in isolation mode".

**Stories the criteria name.** `core-basics--basic` (`code/core/template/stories/basics.stories.ts`) has `args: { label: 'Click Me!' }` and renders the React template `Button` (`code/renderers/react/template/components/Button.jsx`), which puts `label` inside `<button type="button">`, so an empty label means a button with no text. `controls-basics--defined` (`code/core/template/stories/controls/basics.stories.ts:48-66`) has `text: 'hello'` and `radio: 'a'` among its args and renders its args as JSON, giving a two-pair case where one value is empty.

**Comparison rule for the criteria.** A link is compared by URI-decoding the `args` query parameter and comparing its `;`-separated pairs as a set. Order is not asserted: the manager rewrites the address bar from the story's own argument order after the story loads, so pair order is not stable and is not part of what the issue reports.

## Success criteria

See the acceptance criteria list. In short: with an empty-string argument in the current URL, the tab opened by "Open in isolation mode" carries that argument and renders the story with the empty value; arguments that work today are unaffected; a story with no `args` in its URL still opens a tab with no `args` parameter at all.

## Out of scope

- **Globals.** The issue is about args. Empty-string *globals* travel through the same merge, so a fix placed in the shared parser improves them at the same time; that is acceptable but is not required and is not asserted by any criterion (owner, 2026-10-21).
- **The keyboard shortcut and "copy story link".** `openInIsolation` and `copyStoryLink` (`code/core/src/manager-api/modules/shortcuts.ts:508-529`) use the same call and will benefit, but clipboard and keyboard paths are not tested here.
- **Composed Storybooks (`refId`) and the main preview iframe.** Not part of the report; their behaviour must simply not change.
- **Other falsy values.** `0`, `false`, `null` and `undefined` already have their own encodings (`!null`, `!false`, …) and are untouched. A pair written without a `:` keeps whatever it does today.
- **Controls-panel behaviour.** How a person clears a control, and the warning about unsafe URL args, are unchanged.
- **Any change to the `args` URL format**, to `buildArgsParam`, or to the preview-side parser.