# Keep an empty-string arg in the link that opens a story in a new tab

## The problem

Open the story Controls / Basics, Defined in Storybook. Its text control starts as `hello`. Clear the box so the value is empty: the preview updates and the address bar gains `args=text:`. Now press Open in isolation mode in the toolbar. The new tab opens with no args at all, and the story in it renders `text` as `hello` again. The Copy story link shortcut has the same result: the copied link carries no args.

## Why it matters

An empty string is how people check a missing label, a blank placeholder or a cleared field, and opening the story in its own tab is how they show it to someone else. The link silently reverts to the default value, so the reviewer who opens it sees a normal component and reports nothing wrong. The person who sent the link has no way to tell from the link that the state was lost.

## The fix

The step that merges the current page's args into the link for a new tab discards any pair whose value is falsy, and an empty string is falsy. It changes to discard only pairs with no name, so a pair whose value is empty is carried through. That step is the only place the args string is taken apart and rebuilt for the new link, and the preview already reads a pair written as a name, a colon and nothing after it back as an empty string, so nothing else has to change. Args that have a value keep the links they produce today, and a story with nothing changed still produces a link with no args.

```flow
Before: Person clears the text control -> Address bar keeps args=text: -> *Link builder drops the empty value* -> New tab shows text as hello
After: Person clears the text control -> Address bar keeps args=text: -> *Link builder keeps the empty value* -> New tab shows text as empty
```

## How you'll know

- Clear the text control on Controls / Basics, Defined and open the story in a new tab: the new tab's address still carries `args=text:`.
- The story in that new tab shows the text arg as an empty value instead of `hello`.
- Set the text control to `world` and open a new tab: the address carries `args=text:world`, exactly as it does today.
- Open a story with every control still at its initial value: the new tab's address carries no args at all.

## Constraints

- Repository `bolnet/storybook`, branch `demo-36356`. Pull requests in this repository target `next`.
- Fix what the issue reports and change nothing else anyone can see.
- The args string keeps its current format: `name:value` pairs joined by `;`, an empty value written as the name, a colon and nothing after it. The preview already reads that form back as an empty string, so the format does not change.
- A story with no changed args still produces a link with no `args` parameter.
- The same merge step handles the `globals` parameter, so a global set to an empty string survives too. That is a consequence of fixing one shared step, not a second change.
- Acceptance tests run with Playwright in a real browser against the internal Storybook, so every criterion below is stated as something a browser can read.

## Decisions and evidence

No question was put to the person. The issue states what happens and what should happen, so the spec is to make it behave as the issue says and change nothing else anyone can see.

Read in the repository:

- `code/core/src/manager-api/modules/url.ts:42-50`, `parseSerializedParam`, ends with `.filter(([key, value]) => key && value)`. An empty value is falsy, so the pair is removed. This is the line the issue links as `v10.6.0/code/core/src/manager-api/modules/url.ts#L49`.
- `mergeSerializedParams` (same file, lines 52-58) is its only caller. `getStoryHrefs` (lines 281-286) calls it for both `args` and `globals` when `inheritArgs` and `inheritGlobals` are on, and both returned links are built from the result (lines 299-309).
- Open in isolation mode is the toolbar button in `code/core/src/manager/components/preview/tools/share.tsx:84-115`. It calls `api.getStoryHrefs(storyId, { base: 'origin', refId, inheritArgs: true })` and opens `previewHref` in a new tab. The `openInIsolation` shortcut does the same (`code/core/src/manager-api/modules/shortcuts.ts:508-514`) and `copyStoryLink` copies `managerHref` (lines 523-529).
- The empty value does reach the address bar, so the loss is only in the merge. `buildArgsParam` (`code/core/src/router/utils.ts:189-217`) accepts the empty string, because its `VALIDATION_REGEXP` is `/^[a-zA-Z0-9 _-]*$/`, and emits `text:`. `buildNavigationUrl` (`code/core/src/manager-api/lib/url.ts:1-10`) drops only `null` and `undefined`.
- The preview end already handles it. `parseArgsParam('text:')` (`code/core/src/preview-api/modules/preview-web/parseArgsParam.ts:108-121`) returns `{ text: '' }`.
- The story named in the criteria is `core-controls-basics--defined`, title Controls / Basics, export Defined, in `code/core/template/stories/controls/basics.stories.ts`. Its args include `text: 'hello'` and its argTypes include `text: { control: 'text' }`. Clearing that box sets the arg to the empty string: `code/addons/docs/src/blocks/controls/Text.tsx:35-37` passes `event.target.value` straight to `onChange`.
- The story's decorator passes every arg into the `Pre` component, which renders them as indented JSON inside `<pre data-testid="pre">` (`code/renderers/react/template/components/Pre.jsx`). So `"text": ""` is readable text in the new tab's page. Note that the nested `object` arg also has a `text` key, with the value `Hello world`, so the two are distinguishable.
- An empty args string must stay empty. `parseSerializedParam('')` yields no pairs today because the only key is empty, and AC-04 guards that path so a change to the filter cannot start emitting a stray `args=`.

Assumptions recorded rather than asked:

- forge runs `bash scripts/forge-e2e-internal.sh` with Playwright, acceptance root `code/e2e-internal`, against the internal Storybook served from `code/.storybook` on `http://localhost:6006`. The criteria are written against that running app.
- The pull request targets `next`, which `AGENTS.md` states is the target of every pull request in this repository.
- Builders follow the repository's own rules without being asked, including formatting with `cd code && yarn fmt:write` after editing.

## Success criteria

- AC-01: Given the internal Storybook is open at the story `core-controls-basics--defined` and its text control has been cleared so the box is empty, when the person presses Open in isolation mode, then the address of the new tab that opens contains `args=text:`.
- AC-02: Given the same cleared text control, when the person presses Open in isolation mode and the new tab finishes loading, then the preview in the new tab shows `"text": ""` and does not show `"text": "hello"`.
- AC-03: Given the same story with its text control set to `world`, when the person presses Open in isolation mode, then the address of the new tab contains `args=text:world`.
- AC-04: Given the same story with every control still at its initial value, when the person presses Open in isolation mode, then the address of the new tab contains no `args=` parameter.

## Out of scope

- An args pair written with no colon, such as `args=text`. It is merged as `text:undefined` today. The issue does not report it and it stays as it is.
- Values containing spaces or characters that get percent-encoded on the way into the link. How those are encoded does not change, and no criterion covers them.
- Other falsy values. Numbers, `false`, `null` and `undefined` already have their own encodings in the args string (`!false`, `!null`, `!undefined`, digits), so none of them is affected and none of them changes.
- How args are validated or which characters `buildArgsParam` allows.
- Unit tests for the merge step. forge's suite for this run is the Playwright browser suite, so the criteria are browser-observable. A unit test may be added later by a contributor.