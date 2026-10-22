import { expect, type Page, test } from '@playwright/test';
import process from 'process';

import { PREVIEW_STORY_TIMEOUT, waitForPreviewReady } from './helpers.ts';

/**
 * Acceptance tests for "Keep empty-string args when a story opens in a new tab"
 * (storybookjs/storybook#36356).
 *
 * The "Open in isolation mode" toolbar button builds a preview link that inherits the args of the
 * manager's URL. An arg whose value is an empty string must travel with it, so the opened tab shows
 * the story the person was looking at.
 *
 * Every test drives the internal Storybook (`code/.storybook`) over HTTP only: it reads the manager
 * URL, clicks the toolbar button, and reads the URL and the rendered page of the tab that opens.
 * Each test navigates to its own manager URL in its own browser context, so no test can see what
 * another left behind.
 *
 * Run locally (from repo root) with internal Storybook on port 6006:
 *   cd code && yarn storybook:ui
 *   yarn playwright test -c e2e-internal/playwright.config.ts e2e-internal/isolation-mode-empty-args.spec.ts
 */

const storybookUrl =
  process.env.FORGE_SANDBOX_URL || process.env.STORYBOOK_URL || 'http://localhost:6006';

/** The opened tab navigates to the preview on its own; it is not waiting on a compile. */
const NEW_TAB_TIMEOUT = 20_000;

/**
 * The serialized `args` parameter of a URL as a list of `key:value` pairs, URI-decoded.
 *
 * `searchParams` decodes the parameter, so this reads both the raw link the manager builds
 * (`args=label:`) and the form the preview re-encodes into its address bar (`args=label%3A`).
 * An absent parameter is no pairs at all.
 */
function argsPairs(url: string): string[] {
  const value = new URL(url).searchParams.get('args');
  return value === null ? [] : value.split(';').filter((pair) => pair.length > 0);
}

/** Every serialized pair in the query, across all of its parameters. */
function queryPairs(url: string): string[] {
  return [...new URL(url).searchParams.entries()].flatMap(([, value]) => value.split(';'));
}

/** Opens the internal Storybook manager at `search` and waits for the selected story to settle. */
async function openManager(page: Page, search: string): Promise<void> {
  await page.goto(`${storybookUrl}/${search}`);
  await waitForPreviewReady(page);
}

/**
 * Waits until the manager has written exactly `expected` into the address bar.
 *
 * The manager rewrites `args` from the story's own args once it has loaded, so this is the point at
 * which "the args in the current URL" is a settled fact and the click below can be compared to it.
 */
async function expectManagerArgs(page: Page, expected: string[]): Promise<void> {
  await expect
    .poll(() => argsPairs(page.url()).sort(), { timeout: PREVIEW_STORY_TIMEOUT })
    .toStrictEqual([...expected].sort());
}

/** Clicks the toolbar button and returns the tab it opened, once that tab is on the preview URL. */
async function openInIsolation(page: Page): Promise<Page> {
  const button = page.getByRole('button', { name: 'Open in isolation mode' });
  await expect(button).toBeVisible({ timeout: PREVIEW_STORY_TIMEOUT });

  const [opened] = await Promise.all([page.context().waitForEvent('page'), button.click()]);
  await opened.waitForURL(/iframe\.html/, { timeout: NEW_TAB_TIMEOUT });
  return opened;
}

/**
 * AC-04's domain: `args` parameters built from one to three pairs of the declared string args of
 * `controls-basics--defined`, each value empty or a short alphanumeric string, including
 * combinations with no empty value, one empty value, and all values empty.
 *
 * Every non-empty value differs from the story's initial value (`text: 'hello'`, `radio: 'a'`,
 * `select: 'b'`, `inlineRadio: 'c'`), so the manager keeps the whole pair in the address bar
 * instead of dropping it as unchanged — `expectManagerArgs` holds it to that.
 */
const ARGS_CASES: Array<{ name: string; args: string; managerArgs: string[] }> = [
  { name: 'one pair, no empty value', args: 'text:world', managerArgs: ['text:world'] },
  { name: 'one pair, empty value', args: 'text:', managerArgs: ['text:'] },
  {
    name: 'two pairs, no empty value',
    args: 'radio:b;select:a',
    managerArgs: ['radio:b', 'select:a'],
  },
  { name: 'two pairs, first empty', args: 'text:;radio:b', managerArgs: ['text:', 'radio:b'] },
  { name: 'two pairs, second empty', args: 'radio:b;select:', managerArgs: ['radio:b', 'select:'] },
  {
    name: 'three pairs, no empty value',
    args: 'text:world;radio:b;inlineRadio:a',
    managerArgs: ['text:world', 'radio:b', 'inlineRadio:a'],
  },
  {
    name: 'three pairs, one empty value',
    args: 'radio:b;select:;inlineRadio:a',
    managerArgs: ['radio:b', 'select:', 'inlineRadio:a'],
  },
  {
    name: 'three pairs, all values empty',
    args: 'text:;radio:;select:',
    managerArgs: ['text:', 'radio:', 'select:'],
  },
];

test.describe('isolation mode keeps empty-string args', () => {
  test.setTimeout(120_000);

  test('AC-01 the opened tab keeps an argument whose value is an empty string', async ({
    page,
  }) => {
    // Given the Button story is showing with its label argument empty
    await openManager(page, '?path=/story/core-basics--basic&args=label:');
    await expectManagerArgs(page, ['label:']);

    // When "Open in isolation mode" is clicked and a new tab opens
    const opened = await openInIsolation(page);

    try {
      // Then that tab's args parameter carries the pair with the empty value
      expect(argsPairs(opened.url())).toContain('label:');
    } finally {
      await opened.close();
    }
  });

  test('AC-02 the story in the opened tab renders with the empty value', async ({ page }) => {
    // Given the Button story is showing with its label argument empty
    await openManager(page, '?path=/story/core-basics--basic&args=label:');
    await expectManagerArgs(page, ['label:']);

    // When "Open in isolation mode" is clicked and a new tab opens
    const opened = await openInIsolation(page);

    try {
      // Then the button in it has no text, and the original label is nowhere on the page
      const storyButton = opened.getByRole('button').first();
      await expect(storyButton).toBeAttached({ timeout: NEW_TAB_TIMEOUT });
      await expect(storyButton).toHaveText('', { timeout: NEW_TAB_TIMEOUT });
      await expect(opened.getByText('Click Me!')).toHaveCount(0, { timeout: NEW_TAB_TIMEOUT });
    } finally {
      await opened.close();
    }
  });

  test('AC-03 an empty-value argument and a non-empty one both reach the opened tab', async ({
    page,
  }) => {
    // Given the controls story is showing with an empty `text` and `radio` set to `b`
    await openManager(page, '?path=/story/controls-basics--defined&args=text:;radio:b');
    await expectManagerArgs(page, ['text:', 'radio:b']);

    // When "Open in isolation mode" is clicked and a new tab opens
    const opened = await openInIsolation(page);

    try {
      // Then that tab's args parameter is exactly those two pairs
      expect(argsPairs(opened.url()).sort()).toStrictEqual(['radio:b', 'text:']);
    } finally {
      await opened.close();
    }
  });

  test('AC-04 the opened tab holds the same arguments the manager URL held', async ({ page }) => {
    // Eight manager loads, each waiting for its story and for a new tab.
    test.setTimeout(420_000);

    const mismatches: string[] = [];

    for (const testCase of ARGS_CASES) {
      // Given the controls story is showing with this case's args in the URL
      await openManager(page, `?path=/story/controls-basics--defined&args=${testCase.args}`);
      await expectManagerArgs(page, testCase.managerArgs);
      const managerArgs = argsPairs(page.url()).sort();

      // When "Open in isolation mode" is clicked and a new tab opens
      const opened = await openInIsolation(page);
      const openedArgs = argsPairs(opened.url()).sort();
      await opened.close();

      // Then the two sets of pairs are equal: no key dropped, no key added
      const manager = JSON.stringify(managerArgs);
      const tab = JSON.stringify(openedArgs);
      if (manager !== tab) {
        mismatches.push(`${testCase.name}: manager ${manager}, opened tab ${tab}`);
      }
    }

    expect(mismatches).toStrictEqual([]);
  });

  // Guard: this is what must not change. A story with no args in its URL has nothing to inherit,
  // and a pair with an empty key stays discarded, so no empty args parameter and no bare `:` is
  // invented. Green at the base commit and after.
  test('AC-05 a story with no arguments opens a tab with no args parameter', async ({ page }) => {
    // Given the Button story is showing with no args in the URL and no control changed
    await openManager(page, '?path=/story/core-basics--basic');
    await expectManagerArgs(page, []);

    // When "Open in isolation mode" is clicked and a new tab opens
    const opened = await openInIsolation(page);

    try {
      // Then that tab's URL has no args parameter and no pair with an empty key
      expect(new URL(opened.url()).searchParams.has('args')).toBe(false);
      expect(queryPairs(opened.url()).filter((pair) => pair.startsWith(':'))).toStrictEqual([]);

      // ... and the button still shows its original text
      const storyButton = opened.getByRole('button').first();
      await expect(storyButton).toBeAttached({ timeout: NEW_TAB_TIMEOUT });
      await expect(storyButton).toHaveText('Click Me!', { timeout: NEW_TAB_TIMEOUT });
    } finally {
      await opened.close();
    }
  });
});
