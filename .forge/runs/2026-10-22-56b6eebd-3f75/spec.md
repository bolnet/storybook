# Keep empty string arguments in the link that opens a story in a new tab

## The problem

A person opens a story that takes a text argument, clears that argument in the Controls panel, and sees the story re-render with nothing in that field. The address bar keeps the cleared value. They then click "Open in isolation mode" in the preview toolbar to show the story on its own. The new tab opens the same story with the argument back at its original text, because the step that assembles the arguments for that link throws away every argument whose value is an empty string. The same assembly step feeds the copied story link and the keyboard shortcut that opens a story in isolation.

## Why it matters

An empty field is one of the states a component most needs reviewing in, and it is the one state a person cannot hand to someone else. Anyone who clears a text argument and shares or opens the result gets a link that silently shows a different story state than the one they were looking at, so a reviewer approves the wrong thing. The person who reported this hit it while passing an empty string on purpose.

## The fix

The code that merges the manager's current arguments with any extra arguments, before writing them into the new tab's link, keeps a pair whose value is an empty string. It still drops a pair whose name is empty, which is what that step was guarding against.

The change belongs there because every other part of the chain already handles an empty value: the code that writes the address bar keeps it, the address format already expresses it, and the preview's own reader already turns it back into an empty string. The merge step is the only place that discards it. The address format does not change, and no other argument's behaviour changes.

```flow
Before: Person clears the text control -> Address keeps the empty value -> *Link builder drops it* -> New tab shows the old text
After: Person clears the text control -> Address keeps the empty value -> *Link builder keeps it* -> New tab shows it empty
```

## How you'll know

- Clear a story's text argument in the Controls panel, click "Open in isolation mode": the new tab shows that argument empty, not its old text.
- Open a story from an address that already carries an empty argument, click "Open in isolation mode": the new tab's address still carries it.
- A non-empty argument is still carried through to the new tab with exactly its value.
- A story with no changed arguments still opens a new tab whose address has no arguments at all.

## Constraints

- Repository storybookjs/storybook, branch next, as shared in the request.
- This is a reported defect: make it behave the way the issue says, and change nothing else anyone can see. Recorded as the default for a bug fix (assumption, owner, 2026-10-21).
- A pair whose name is empty is still dropped from the link, so an empty set of arguments produces a link with no arguments parameter, not an empty one.
- The arguments format in the address does not change: an empty value stays written as the argument name followed by a colon and nothing after it (`text:`), which is what `buildArgsParam` already produces and what the preview's `parseArgsParam` already reads back as an empty string.
- forge runs only the Playwright suite in `code/e2e-internal` (`bash scripts/forge-e2e-internal.sh`). The existing unit tests in `code/core/src/manager-api/tests/url.test.js` are not run by that command; the change must not contradict them, in particular `supports extra args and globals with merging`, which expects merged pairs in the form `&args=a:2;b:2;c:3`.
- No new dependency, and no change to the toolbar button, the Controls panel or the preview.

## Decisions and evidence

No question was put to the person. The issue states what happens and what should happen, and names the line it happens on, so the shape of the work is not open.

Where the value is lost, read from the repository:

- `code/core/src/manager-api/modules/url.ts:49`, inside `parseSerializedParam`: `.filter(([key, value]) => key && value)`. `encodeURIComponent('')` is `''`, which is falsy, so a pair such as `text:` is removed along with pairs that have an empty name. This is the line the issue links to (`v10.6.0/code/core/src/manager-api/modules/url.ts#L49`).
- `mergeSerializedParams` (`url.ts:52-58`) calls it for both the inherited and the extra parameters, and `getStoryHrefs` (`url.ts:281-286`) calls `mergeSerializedParams` for `args` and for `globals` whenever `inheritArgs` or `inheritGlobals` is set. Both `managerHref` and `previewHref` (`url.ts:308-309`) are built from the result.
- The toolbar button is "Open in isolation mode" (its `ariaLabel` and `tooltip`), in `code/core/src/manager/components/preview/tools/share.tsx:94-107`. It calls `api.getStoryHrefs(storyId, { base: 'origin', refId, inheritArgs: true })` and then `window.open(originHrefs.previewHref, '_blank', 'noopener,noreferrer')`. It is a default tool for every Storybook, listed in `code/core/src/manager/container/Preview.tsx:23-29`.
- The rest of the chain already supports an empty value. `buildArgsParam` in `code/core/src/router/utils.ts:185-217` serialises `{ text: '' }` to `text:`; `validateArgs` there accepts the empty string. `code/core/src/manager-api/lib/url.ts:6` filters only `null` and `undefined`, so the address bar keeps `args=text:`. `parseArgsParam` in `code/core/src/preview-api/modules/preview-web/parseArgsParam.ts:108-121` reads `text:` back as `{ text: '' }` and accepts it.

What the acceptance tests run against, decided here so no later phase has to ask:

- The story is `core-controls-basics--defined`, from `code/core/template/stories/controls/basics.stories.ts:48-66`. It declares `text: { control: 'text' }` (line 34) and the story sets `text: 'hello'` (line 65). It renders every current argument as JSON inside `<pre data-testid="pre">` (the `Pre` template component, `code/renderers/react/template/components/Pre.jsx`), so an empty text argument is visible on the page as `"text": ""`. That story id already appears in `code/e2e-sandbox/addon-controls.spec.ts:81` as `core-controls-basics--undefined`, from the same file.
- In the Controls panel the text control is a textarea reachable as `textarea[name=text]` or `#control-text` (`getControlId` in `code/addons/docs/src/blocks/controls/helpers.ts`; the panel passes no story id, as `#control-select` in `code/e2e-sandbox/addon-controls.spec.ts:89` shows). Clearing it calls `onChange(event.target.value)` with `''` (`code/addons/docs/src/blocks/controls/Text.tsx:35-37`).
- The link opens through `window.open`, so a test reads it as a Playwright popup: the popup's address for the criteria about the address, the popup page's `pre` text for the criterion about what is rendered.
- The manager rewrites its own address shortly after a story loads (`updateArgsParam` in `url.ts:357-374`), so a test waits for the address to settle before clicking, and compares the new tab's arguments against the address at the moment of the click.
- Tests go under `code/e2e-internal`, run by `bash scripts/forge-e2e-internal.sh` against the internal Storybook at `http://localhost:6006`.

## Success criteria

- AC-01: Given the internal Storybook showing story `core-controls-basics--defined`, whose `text` argument starts as `hello`, when the person clears the `text` field in the Controls panel and then clicks "Open in isolation mode", then the story rendered in the new tab shows `"text": ""`.
- AC-02: Given the manager opened at `?path=/story/core-controls-basics--defined&args=text:`, when the person clicks "Open in isolation mode", then the new tab's address contains `args=text:`.
- AC-03: For every arguments segment a person can put in the manager address for `core-controls-basics--defined`, taken over: none at all, `text:hi`, `text:`, `number:5;text:`, and `text:;select:c`, the new tab opened by "Open in isolation mode" carries every name and value pair of the manager address's arguments segment, empty values included, and carries no arguments parameter at all when the manager address has none.

## Out of scope

- Globals. `mergeSerializedParams` serves both `args` and `globals`, so a fix in that function covers globals too, but no criterion here tests an empty-string global and no separate work is asked for it.
- The copied story link and the keyboard shortcut that opens a story in isolation (`code/core/src/manager-api/modules/shortcuts.ts:508-528`). Both build their link through the same call and so follow the fix; neither is separately tested, because reading the clipboard in the browser needs permissions this suite does not grant.
- A pair written with no colon at all (`args=text`), which the current code turns into the literal value `undefined`. Not reported, not changed, not tested.
- Writing or updating unit tests for the manager URL module. forge's single test command runs only the Playwright suite, so unit tests would not be run in this run.
- Any change to how the Controls panel represents an empty value, or to the arguments format in the address.
