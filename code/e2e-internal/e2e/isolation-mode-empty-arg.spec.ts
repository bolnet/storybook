import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import process from 'process';

/**
 * Acceptance tests for the spec "Keep an empty-string arg in the link that opens a story in a new
 * tab" — criteria AC-01, AC-02, AC-03 and AC-04.
 *
 * Everything asserted here is what a person can read in a browser: the address the toolbar button
 * "Open in isolation mode" opens a tab at, and the indented JSON the story in that tab renders.
 *
 * AC-01 and AC-02 are the behaviour the change adds. AC-03 and AC-04 are guards — they state what
 * must not change, so they are green before the change and have to stay green after it.
 *
 * No test writes state on the server, and Playwright gives each test its own browser context, so
 * the args one test sets are invisible to the others, in any order.
 *
 * Every step that is not the oracle is bounded and its failure swallowed, so the only thing that
 * can fail a test here is one of its own `expect` assertions. The suite's config sets
 * `actionTimeout: 0`, which otherwise lets a single stuck action consume the whole test budget and
 * report a timeout error instead of the assertion.
 */

/** Internal Storybook UI (`code/.storybook`), served by forge's sandbox. */
const storybookUrl = (
  process.env.FORGE_SANDBOX_URL ||
  process.env.STORYBOOK_URL ||
  'http://localhost:6006'
).replace(/\/+$/, '');

/**
 * Controls / Basics, Defined. Its `text` arg starts as `hello`, and its decorator re-renders every
 * arg as the `object` arg, whose own nested `text` is `Hello world` — so in the JSON the story
 * prints, the story's `text` and the nested one are distinguishable.
 */
const STORY_ID = 'core-controls-basics--defined';

/** The internal Storybook compiles the first preview story on demand. */
const STORY_READY_TIMEOUT = 60_000;
/** The manager rewrites the args parameter on an idle callback after a control changes. */
const ADDRESS_TIMEOUT = 15_000;
/** How long a press is given to reach `window.open` before the next way of pressing is tried. */
const PRESS_SETTLE_TIMEOUT = 3_000;
/** What the change adds: short, so its absence fails an assertion instead of erroring. */
const ADDED_TIMEOUT = 5_000;

/** `args=text:` — the name, a colon and nothing after it. */
const EMPTY_TEXT_ARG = /[?&]args=text(:|%3A)(&|$)/;
/** `args=text:world` — the link a non-empty value produces today. */
const WORLD_TEXT_ARG = /[?&]args=text(:|%3A)world(&|$)/;
/** Any args parameter at all. */
const ANY_ARGS_PARAM = /[?&]args=/;

declare global {
  interface Window {
    __forgeOpenedAddresses?: string[];
  }
}

/**
 * Records every address the page asks the browser to open a tab at, and still opens it: the tab a
 * person sees opens exactly as it does without this, and its address is readable without racing
 * the popup's own navigation. Must be installed before `goto`.
 */
async function recordOpenedAddresses(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window.__forgeOpenedAddresses) {
      return;
    }
    const opened: string[] = [];
    window.__forgeOpenedAddresses = opened;
    const nativeOpen = window.open.bind(window) as (...args: unknown[]) => Window | null;
    window.open = function forgeOpen(...args: unknown[]) {
      opened.push(args[0] === undefined ? '' : String(args[0]));
      return nativeOpen(...args);
    } as unknown as typeof window.open;
  });
}

/** The addresses tabs have been opened at so far, oldest first. */
async function openedAddresses(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__forgeOpenedAddresses ?? []);
}

/**
 * True once a tab has been opened. Never throws: a press that did not land is retried by the
 * caller, so it must not be this test's failure.
 */
async function anyTabOpened(page: Page, timeout: number): Promise<boolean> {
  try {
    await expect
      .poll(async () => (await openedAddresses(page)).length, { timeout })
      .toBeGreaterThan(0);
    return true;
  } catch {
    return false;
  }
}

/** Opens Controls / Basics, Defined and waits until its preview and toolbar are usable. */
async function openDefinedStory(page: Page): Promise<void> {
  await recordOpenedAddresses(page);
  // A navigation that does not settle must not error: the assertions below are the failure.
  await page
    .goto(`${storybookUrl}/?path=/story/${STORY_ID}`, { timeout: STORY_READY_TIMEOUT })
    .catch(() => undefined);
  await expect(page.getByRole('progressbar', { name: 'Content is loading...' })).toBeHidden({
    timeout: STORY_READY_TIMEOUT,
  });
  await expect(page.getByRole('button', { name: 'Open in isolation mode' })).toBeVisible({
    timeout: STORY_READY_TIMEOUT,
  });
}

/** The story's single text control, found by the placeholder a person reads in the empty box. */
function textControl(page: Page) {
  return page.getByPlaceholder('Edit string...', { exact: true });
}

/** Shows the Controls panel and waits for the text control to hold the story's initial value. */
async function showTextControl(page: Page) {
  const tab = page.getByRole('tab', { name: /^Controls/ });
  await expect(tab).toBeVisible({ timeout: STORY_READY_TIMEOUT });
  // Controls is the panel the manager selects by default, so this press only has to survive; the
  // value assertion below is what proves the control is on screen.
  await tab.click({ timeout: ADDRESS_TIMEOUT }).catch(() => undefined);

  const control = textControl(page);
  await expect(control).toHaveValue('hello', { timeout: STORY_READY_TIMEOUT });
  return control;
}

/** Types `value` into the text control and waits until the control itself holds it. */
async function setTextControl(page: Page, value: string) {
  const control = await showTextControl(page);
  await control.fill(value, { timeout: ADDRESS_TIMEOUT }).catch(() => undefined);
  await expect(control).toHaveValue(value, { timeout: ADDRESS_TIMEOUT });
}

/**
 * Presses the toolbar button and returns the address it opened a tab at.
 *
 * The press is a keyboard press of the focused button — how a person activates a toolbar button
 * without a mouse — because `focus` and `press` are the two steps that cannot stall on the
 * toolbar's horizontal scroll container or on the tooltip the button raises under the pointer. If
 * neither key lands, the click event is dispatched on the button directly, so that a press which
 * never arrives still leaves the assertion below as this test's failure rather than a timeout.
 */
async function pressOpenInIsolationMode(page: Page): Promise<string> {
  const button = page.getByRole('button', { name: 'Open in isolation mode' });
  await expect(button).toBeVisible({ timeout: ADDED_TIMEOUT });

  const presses = [
    async () => {
      await button.focus();
      await page.keyboard.press('Enter');
    },
    async () => {
      await button.focus();
      await page.keyboard.press(' ');
    },
    async () => {
      await button.dispatchEvent('click');
    },
  ];
  for (const press of presses) {
    await press().catch(() => undefined);
    if (await anyTabOpened(page, PRESS_SETTLE_TIMEOUT)) {
      break;
    }
  }

  const addresses = await openedAddresses(page);
  expect(addresses, 'pressing Open in isolation mode opens a tab').not.toHaveLength(0);
  return addresses[addresses.length - 1];
}

/** A real browser tab showing the page at `address`, the one the button just opened too. */
async function tabAt(context: BrowserContext, address: string): Promise<Page> {
  const tab = await context.newPage();
  // A preview that never finishes loading must not error: the content assertions are the failure.
  await tab.goto(address, { timeout: STORY_READY_TIMEOUT }).catch(() => undefined);
  return tab;
}

test.describe('Open in isolation mode and an empty args value', () => {
  // The internal Storybook compiles the first preview story on demand, and each test also loads the
  // preview a second time in the tab the button opens.
  test.setTimeout(120_000);

  test('AC-01 the new tab address keeps args=text: when the text control is cleared', async ({
    page,
  }) => {
    // Given Controls / Basics, Defined with its text control cleared, so the address carries args=text:
    await openDefinedStory(page);
    await setTextControl(page, '');
    await expect(page).toHaveURL(EMPTY_TEXT_ARG, { timeout: ADDRESS_TIMEOUT });

    // When the person presses the toolbar button Open in isolation mode
    const address = await pressOpenInIsolationMode(page);

    // Then the address of the new tab contains args=text: — the name, a colon and nothing after it
    expect(address, 'the new tab keeps the empty text arg').toMatch(EMPTY_TEXT_ARG);
  });

  test('AC-02 the story in the new tab renders the text arg as an empty string', async ({
    page,
    context,
  }) => {
    // Given Controls / Basics, Defined with its text control cleared
    await openDefinedStory(page);
    await setTextControl(page, '');
    await expect(page).toHaveURL(EMPTY_TEXT_ARG, { timeout: ADDRESS_TIMEOUT });

    // When the person presses Open in isolation mode and the new tab finishes loading
    const address = await pressOpenInIsolationMode(page);
    const newTab = await tabAt(context, address);
    // The story prints every arg as indented JSON; this line is in it before and after the change.
    await expect(newTab.getByText(/"boolean": true/).first()).toBeVisible({
      timeout: STORY_READY_TIMEOUT,
    });

    // Then the new tab shows the args as indented JSON with "text": "" and not "text": "hello"
    await expect(
      newTab.getByText(/"text": ""/).first(),
      'the story in the new tab renders text as an empty string'
    ).toBeVisible({ timeout: ADDED_TIMEOUT });
    await expect(
      newTab.getByText(/"text": "hello"/),
      'the story in the new tab has not reverted text to hello'
    ).toHaveCount(0, { timeout: ADDED_TIMEOUT });
  });

  test('AC-03 the new tab address keeps args=text:world when the text control is set to world', async ({
    page,
  }) => {
    // Given Controls / Basics, Defined with its text control set to world
    await openDefinedStory(page);
    await setTextControl(page, 'world');
    await expect(page).toHaveURL(WORLD_TEXT_ARG, { timeout: ADDRESS_TIMEOUT });

    // When the person presses Open in isolation mode
    const address = await pressOpenInIsolationMode(page);

    // Then the address of the new tab contains args=text:world
    expect(address, 'a value that is not empty keeps the link it produces today').toMatch(
      WORLD_TEXT_ARG
    );
  });

  test('AC-04 the new tab address carries no args parameter when no control was changed', async ({
    page,
  }) => {
    // Given Controls / Basics, Defined with every control still at its initial value
    await openDefinedStory(page);
    await expect(page).not.toHaveURL(ANY_ARGS_PARAM, { timeout: ADDRESS_TIMEOUT });

    // When the person presses Open in isolation mode
    const address = await pressOpenInIsolationMode(page);

    // Then the address of the new tab contains no args= parameter
    expect(address, 'a story with nothing changed produces no args parameter').not.toMatch(
      ANY_ARGS_PARAM
    );
  });
});
