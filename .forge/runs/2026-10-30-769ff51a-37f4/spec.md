# Empty-string args survive opening a story in a new tab

## The problem

In the internal Storybook, open Example / Button and its Primary story, then clear the Label control. The button in the canvas goes blank, and the address of the tab keeps the label with an empty value. Now click the toolbar button "Open in isolation mode". The new tab drops the label entirely and shows the button labelled Button again, as if the control had never been cleared.

## Why it matters

Anyone who shares a story by opening it in a new tab, or hands that address to someone else, sends the wrong state whenever one of the story's string arguments is empty. The person on the other end sees a different component than the one that was shared, with no sign that anything was lost. Every other argument value travels correctly, so the failure looks arbitrary.

## The fix

The code that reads the arguments and globals already present in the address, before merging them into the link for the new tab, throws away any pair whose value is empty. That reader is the only place the empty value is lost: the address of the current tab holds it correctly, and the story in the new tab renders it correctly once it arrives. So the change belongs in the reader, which keeps a pair with a name and an empty value instead of discarding it.

What does not change: pairs with no name at all are still thrown away, arguments with a value inherit exactly as they do today, and clicking the toolbar button still leaves the current tab where it was.

```flow
Before: Person clears the Label control -> Address keeps label with an empty value -> *Reader drops the empty value* -> New tab shows the label Button
After: Person clears the Label control -> Address keeps label with an empty value -> *Reader keeps the empty value* -> New tab shows a button with no label
```

## How you'll know

- Clear the Label control on Example / Button, Primary, then click "Open in isolation mode": the new tab's address still carries the label, with nothing after it.
- The button in that new tab has no text on it, the same as the canvas you opened it from.
- Set Size to large as well as clearing Label: the new tab carries both, and the button is large with no text.
- Leave Label set to a value and open a new tab: it inherits exactly as it did before.

## Constraints

- Repository https://github.com/bolnet/storybook/tree/demo-36356.
- This is a reported defect. The work makes the behaviour match the issue and changes nothing else anyone can see. No alternative behaviour was offered or considered.
- A pair with an empty name, such as `:orphan`, is still dropped when the args or globals in the address are read. Only the empty-value case changes.
- The same reader serves both the `args` and the `globals` already in the address, so an inherited global whose value is an empty string is kept by the same change. The issue names arguments only; this is an assumption, recorded here because one change covers both and splitting them would mean extra code.
- Clicking "Open in isolation mode" does not change the current tab's address, nor the story shown in it.
- Args that already carry a value inherit into the new tab unchanged, as do additional query params, the ref id, and the embed and freeze params.
- No new dependency is added.
- Acceptance tests are Playwright specs under `code/e2e-internal`, run by `bash scripts/forge-e2e-internal.sh` against the internal Storybook that the script serves. This is read from forge's configuration for this fork, not asked about.

## Decisions and evidence

No questions were put to the person. The issue states what happens, what should happen, and the line the loss occurs on, so the shape of the fix is not open.

Where the value is lost: `code/core/src/manager-api/modules/url.ts:42-50`, `parseSerializedParam`, ends with `.filter(([key, value]) => key && value)`. For the address fragment `label:`, the pair splits to `['label', '']`, and the empty string is falsy, so the pair is removed. `mergeSerializedParams` (`url.ts:52-58`) calls it for both the existing and the extra params, and `getStoryHrefs` calls that for args (`url.ts:281-283`) and globals (`url.ts:284-286`) whenever `inheritArgs` or `inheritGlobals` is set.

Why nothing else needs changing:

- `code/core/src/manager-api/lib/url.ts:6` filters only `null` and `undefined`, so the current tab's address does hold `args=label:`.
- `code/core/src/router/utils.ts:85-123` accepts an empty string in `validateArgs` (its validation pattern allows zero characters), and `buildArgsParam` (`utils.ts:189-217`) encodes `{ label: '' }` as `label:`.
- `code/core/src/preview-api/modules/preview-web/parseArgsParam.ts:105-120` parses `label:` back to `{ label: '' }` and accepts it, so the preview renders the empty value once the param reaches the new tab.

The new tab: the toolbar button with the accessible name "Open in isolation mode" (`code/core/src/manager/components/preview/tools/share.tsx:83-110`) calls `window.open(previewHref, '_blank', 'noopener,noreferrer')`. The `openInIsolation` keyboard shortcut (`code/core/src/manager-api/modules/shortcuts.ts:508-513`) opens the same href through the same function. Because the window is opened with `noopener`, Chromium reports it as a new page on the browser context rather than as a popup of the opener; that is the test's problem to handle, and it does not change the criteria.

Fixture the criteria are written against: the internal Storybook serves Example / Button from `code/addons/onboarding/example-stories/Button.stories.tsx:7-33`; the Primary story has `label: 'Button'` and `primary: true`, and its story id is `example-button--primary`. The Label control is the text control at `code/addons/docs/src/blocks/controls/Text.tsx:35-37`, a textarea whose change handler passes `event.target.value`, so clearing it sends an empty string. `Size` is a select with `small`, `medium` and `large`, which gives AC-03 its second, non-empty pair: with Label cleared and Size set to large, the address carries `args=label:;size:large`, and today the new tab receives only `args=size:large`.

Pairs with an empty name are not covered by a criterion. Navigating straight to such an address does not test the reader: the preview rejects the nameless pair, and the manager then rewrites the address from the story's real args before the toolbar button can be clicked, so the nameless pair never reaches the reader. The behaviour is recorded as a constraint instead.

## Success criteria

- AC-01: Given the internal Storybook showing Example / Button, Primary, with the Label control cleared so the address carries `args=label:`, when the person clicks the toolbar button "Open in isolation mode", then the address of the new tab contains `args=label:`.
- AC-02: Given the same state, when the person clicks "Open in isolation mode", then the button rendered in the new tab has no text, instead of the text Button.
- AC-03: For every name and value pair in the `args` parameter of the current tab's address, whether its value is empty or not, the address of the tab opened by "Open in isolation mode" contains that same pair. The case to drive it with: Label cleared and Size set to large, giving `args=label:;size:large`.

## Out of scope

- An arg whose encoded value contains a colon, such as a date encoded as `!date(2001-02-03T04:05:06.789Z)`, is split wrongly by the same reader today. That is a separate defect and this work leaves it as it is.
- Pairs with an empty name, for the reason given above.
- Copying a story link, composed Storybook refs, and the keyboard shortcut for isolation mode all run through the same code and so inherit the fix, but no criterion tests them.
- Globals get the fix for free (see Constraints) and no criterion tests them.
- Nothing is changed in how the preview parses args, how the address is built as controls change, or how args are validated.
