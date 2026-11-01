# Keep an empty-string arg in the link that opens a story in a new tab

## The problem
Open the Example/Button Primary story in Storybook and clear the Label control, so the button in the preview shows no text. Storybook's own address records the emptied label. Now use the toolbar button Open in isolation mode: the new tab shows the button labelled "Button" again. The link Storybook builds for that tab leaves the emptied label out, so the new tab falls back to the story's own value. Every arg deliberately set to an empty string is lost the same way.

## Why it matters
Anyone who wants to look at a component in an empty state (an empty label, a blank message, an empty placeholder) cannot reach that state in a new tab or pass it to someone else as a link. The state they set is replaced by the story's default without any warning, so they have to describe it in words instead. A defect that only appears with an empty string cannot be handed over as a link at all. The copied story link is built the same way and loses the value too.

## The fix
Storybook keeps the args already in the address as a text list of `name:value` pairs, and reads that list back when it builds the link for the new tab. The step that reads it throws away any pair whose value is empty, because it tests the value for truth instead of for presence. The change belongs there: it is the single place where a pair coming from the address is dropped, and the preview already understands a pair whose value is empty. What does not change: how Storybook writes args into its own address, how the preview reads them, and which values count as safe for a URL. Pairs with no name are still dropped, and a story whose address carries no args still gets a link with no args part.

```flow
Before: Person clears the Label control -> Address keeps label with an empty value -> *Link builder drops the empty pair* -> New tab shows the button labelled Button
After: Person clears the Label control -> Address keeps label with an empty value -> *Link builder keeps the empty pair* -> New tab shows a button with no text
```

## How you'll know
- Clear the Label control on Example/Button Primary and open the story in isolation mode: the new tab shows a button with no text, and its address carries the label argument with an empty value.
- Type "Ship" into the Label control and open in isolation mode: the new tab still reads "Ship".
- Clear Label and turn Primary off, then open in isolation mode: both changes arrive in the new tab.
- Touch no control at all and open in isolation mode: the new tab's address carries no args part, and the button reads "Button".

## Constraints
- Repository https://github.com/bolnet/storybook, branch demo-36356.
- This is a fix: make the behaviour the issue asks for, and change nothing else anyone can see.
- The same list reader also rebuilds the `globals` list for that link, so an empty-string global survives too. That follows from the one change and is expected, and it gets no criterion of its own.
- The preview already reads a pair with an empty value correctly, so nothing in the preview changes.
- Acceptance tests are Playwright specs under `code/e2e-internal`, run against the internal Storybook (`code/.storybook`) that forge serves on port 6006. Every criterion below is observable there: the address of the tab that opens, and what that tab renders.

## Decisions and evidence
No question was put to the person. The issue says what happens and what should happen, and names the line; the repository answers everything else. The facts the build needs:

- `code/core/src/manager-api/modules/url.ts:42-50`, `parseSerializedParam`, ends with `.filter(([key, value]) => key && value)`. Values pass through `encodeURIComponent` on line 48 first, so an empty value stays the empty string and fails that test. This is the line the issue links to.
- `code/core/src/manager-api/modules/url.ts:281-286`: `getStoryHrefs` runs the address's `args` and `globals` through `mergeSerializedParams`, which calls `parseSerializedParam`, whenever `inheritArgs` or `inheritGlobals` is on.
- `code/core/src/manager-api/modules/url.ts:299`: `argsParam = argsParam && \`&args=${argsParam}\``, so an empty list adds no args part. A story with no args in the address must keep getting a link without one; the input `''` parses to `['']`, whose key is empty, which is why the empty-key guard has to stay.
- `code/core/src/router/utils.ts:187-213`, `buildArgsParam`, already writes an emptied string arg into Storybook's address as `label:`, and `code/core/src/manager-api/lib/url.ts` `buildNavigationUrl` keeps it (it drops only `null` and `undefined`). So the value reaches the link builder intact and is lost there.
- `code/core/src/preview-api/modules/preview-web/parseArgsParam.ts:108` turns `label:` back into `{ label: '' }`, and `UrlStore.ts:88` applies it to a standalone preview. The new tab therefore renders the empty value as soon as the link carries it.
- The visible surface: `code/core/src/manager/components/preview/tools/share.tsx:84-110` is the toolbar button whose label and tooltip read "Open in isolation mode"; it calls `getStoryHrefs(storyId, { base: 'origin', refId, inheritArgs: true })` and opens `previewHref` in a new tab. It is a default tool for story view mode (`code/core/src/manager/container/Preview.tsx:23-29`). The copy-story-link shortcut uses the same hrefs (`code/core/src/manager-api/modules/shortcuts.ts:508-528`).
- The story the criteria use: Example/Button Primary, id `example-button--primary`, from `code/addons/onboarding/example-stories/Button.stories.tsx`, with args `primary: true, label: 'Button'`. An existing internal e2e spec already navigates to it (`code/e2e-internal/navigation.spec.ts`).
- Clearing the Label control sets the arg to the empty string, not to undefined: the text control calls `onChange(event.target.value)` (`code/addons/docs/src/blocks/controls/Text.tsx:35-37`). That is what puts `label:` in the address.
- `Button` renders `{label}` inside `<button class="storybook-button ...">` (`code/addons/onboarding/example-stories/Button.tsx`), so an empty label renders a button with no text.

Example of what the link looks like, for the build to match. Storybook's address after the Label control is cleared: `http://localhost:6006/?path=/story/example-button--primary&args=label:`. The link the new tab opens with today: `http://localhost:6006/iframe.html?id=example-button--primary&viewMode=story`. After the fix: `http://localhost:6006/iframe.html?id=example-button--primary&viewMode=story&args=label:`.

## Success criteria
- AC-01: Given Example/Button Primary is open in story view in the internal Storybook and the Label control has been cleared, so Storybook's address carries `args=label:`, when the person uses the toolbar button Open in isolation mode, then the new tab's address contains `args=label:` and the button in the new tab has no text.
- AC-02: Given Example/Button Primary is open with the Label control set to `Ship`, when the person uses Open in isolation mode, then the new tab's address contains `args=label:Ship` and the button in the new tab reads "Ship".
- AC-03: For every `name:value` pair that Storybook's own address carries in its args part for the current story, whether the value is empty or not (for example `label:` alone, `label:Ship`, and `label:` together with `primary:!false` after Primary is turned off), the address of the tab opened by Open in isolation mode carries that same pair, with the same name and the same value, in its own args part.
- AC-04: Given Example/Button Primary is open with no control changed, so Storybook's address has no args part, when the person uses Open in isolation mode, then the new tab's address contains no args part at all and the button in the new tab reads "Button".

## Out of scope
- An args pair in the address with no name (`:x`) and a pair written with no `:` at all keep exactly the behaviour they have today. The issue reports neither, and both are only reachable by hand-editing the address.
- Other falsy values are already carried and are not touched: `0` travels as `0`, `false` as `!false`, `null` as `!null`.
- No change to how args are written into Storybook's own address, nor to how the preview parses them.
- No change to which values count as safe for the URL.
- The copy-story-link shortcut and the composed-Storybook (refId) links use the same link builder and gain the same behaviour, but get no criterion and no test of their own.
- Empty-string `globals` are not tested, although the same change covers them (see Constraints).