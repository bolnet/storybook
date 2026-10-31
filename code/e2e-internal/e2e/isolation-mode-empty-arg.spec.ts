import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import process from 'process';

/**
 * Acceptance tests for the spec "Keep an empty-string arg in the link that opens a story in a new
 * tab" — criteria AC-01, AC-02, AC-03 and AC-04.
 *
 * Everything asserted here is what a person can read in a browser: the address of the tab the
 * toolbar button "Open in isolation mode" opens, and the indented JSON the story in that tab
 * renders.
 *
 * AC-01 and AC-02 are the behaviour the change adds. AC-03 and AC-04 are guards — they state what
 * must not change, so they are green before the change and have to stay green after it.
 *
 * No test writes state on the server, and Playwright gives each test its own browser context, so
 * the args one test sets are invisible to the others, in any order.
 */

/** Internal Storybook UI (`code/.storybook`), served by forge's sandbox. */
const storybookUrl = (
  process.env.FORGE_SANDBOX_URL ||
  process.env.STORYBOOK_URL ||
  'http://localhost:6006'
).replace(/\/+$/, '');

/**
 * Controls / Basics, Defined. Its `text` arg starts as `hello` and its `object` arg is a copy of
 * every arg, whose own nested `text` is `Hello world` — so the two are distinguishable in the JSON.
 */
const STORY_ID = 'core-controls-basics--defined';

/** The internal Storybook compiles the first preview story on demand. */
const STORY_READY_TIMEOUT = 60_000;
/** The manager rewrites the args parameter on an idle callback after a control changes. */
const ADDRESS_TIMEOUT = 15_000;
/** Opening, and then committing the navigation of, the new tab. */
const NEW_TAB_TIMEOUT = 15_000;
/** What the change adds: short, so its absence fails an assertion instead of erroring. */
const ADDED_TIMEOUT = 5_000;

/** `args=text:` — the name, a colon and nothing after it. */
const EMPTY_TEXT_ARG = /[?&]args=text(:|%3A)(&|$)/;
/** `args=text:world` — the link a non-empty value produces today. */
const WORLD_TEXT_ARG = /[?&]args=text(:|%3A)world(&|$)/;
/** Any args parameter at all. */
const ANY_ARGS_PARAM = /[?&]args=/;

/** Opens Controls / Basics, Defined and waits until its preview and toolbar are usable. */
async function openDefinedStory(page: Page): Promise<void> {
  await page.goto(`${storybookUrl}/?path=/story/${STORY_ID}`);
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
  await tab.click();

  const control = textControl(page);
  await expect(control).toHaveValue('hello', { timeout: STORY_READY_TIMEOUT });
  return control;
}

/** Presses the toolbar button and returns the tab it opens, once its address has settled. */
async function pressOpenInIsolationMode(page: Page, context: BrowserContext): Promise<Page> {
  const opened = context.waitForEvent('page', { timeout: NEW_TAB_TIMEOUT });
  await page.getByRole('button', { name: 'Open in isolation mode' }).click();
  const newTab = await opened;
  await expect.poll(() => newTab.url(), { timeout: NEW_TAB_TIMEOUT }).toContain('iframe.html');
  return newTab;
}

test.describe('Open in isolation mode and an empty args value', () => {
  // The first story compile plus a second page load of the preview exceeds the config's 30s.
  test.setTimeout(150_000);

  test('AC-01 the new tab address keeps args=text: when the text control is cleared', async ({
    page,
    context,
  }) => {
    // Given Controls / Basics, Defined with its text control cleared, so the address carries args=text:
    await openDefinedStory(page);
    const control = await showTextControl(page);
    await control.fill('');
    await expect(control).toHaveValue('');
    await expect(page).toHaveURL(EMPTY_TEXT_ARG, { timeout: ADDRESS_TIMEOUT });

    // When the person presses the toolbar button Open in isolation mode
    const newTab = await pressOpenInIsolationMode(page, context);

    // Then the address of the new tab contains args=text: — the name, a colon and nothing after it
    expect(newTab.url()).toMatch(EMPTY_TEXT_ARG);
  });

  test('AC-02 the story in the new tab renders the text arg as an empty string', async ({
    page,
    context,
  }) => {
    // Given Controls / Basics, Defined with its text control cleared
    await openDefinedStory(page);
    const control = await showTextControl(page);
    await control.fill('');
    await expect(control).toHaveValue('');
    await expect(page).toHaveURL(EMPTY_TEXT_ARG, { timeout: ADDRESS_TIMEOUT });

    // When the person presses Open in isolation mode and the new tab finishes loading
    const newTab = await pressOpenInIsolationMode(page, context);
    await expect(newTab.getByText(/"boolean": true/)).toBeVisible({ timeout: STORY_READY_TIMEOUT });

    // Then the new tab shows the args as indented JSON with "text": "" and not "text": "hello"
    await expect(newTab.getByText(/"text": ""/)).toBeVisible({ timeout: ADDED_TIMEOUT });
    await expect(newTab.getByText(/"text": "hello"/)).toHaveCount(0, { timeout: ADDED_TIMEOUT });
  });

  test('AC-03 the new tab address keeps args=text:world when the text control is set to world', async ({
    page,
    context,
  }) => {
    // Given Controls / Basics, Defined with its text control set to world
    await openDefinedStory(page);
    const control = await showTextControl(page);
    await control.fill('world');
    await expect(control).toHaveValue('world');
    await expect(page).toHaveURL(WORLD_TEXT_ARG, { timeout: ADDRESS_TIMEOUT });

    // When the person presses Open in isolation mode
    const newTab = await pressOpenInIsolationMode(page, context);

    // Then the address of the new tab contains args=text:world
    expect(newTab.url()).toMatch(WORLD_TEXT_ARG);
  });

  test('AC-04 the new tab address carries no args parameter when no control was changed', async ({
    page,
    context,
  }) => {
    // Given Controls / Basics, Defined with every control still at its initial value
    await openDefinedStory(page);
    await expect(page).not.toHaveURL(ANY_ARGS_PARAM, { timeout: ADDRESS_TIMEOUT });

    // When the person presses Open in isolation mode
    const newTab = await pressOpenInIsolationMode(page, context);

    // Then the address of the new tab contains no args= parameter
    expect(newTab.url()).not.toMatch(ANY_ARGS_PARAM);
  });
});
