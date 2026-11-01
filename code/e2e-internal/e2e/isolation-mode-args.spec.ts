import process from 'process';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * Acceptance tests for "Keep an empty-string arg in the link that opens a story in a new tab".
 *
 * Every test drives the internal Storybook (`code/.storybook`) over HTTP, uses the toolbar button
 * "Open in isolation mode", and reads the two things the criteria name: the address of the tab that
 * opens, and what that tab renders.
 *
 * Run locally (from repo root) with internal Storybook on port 6006:
 *   cd code && yarn storybook:ui
 *   yarn playwright test -c e2e-internal/playwright.config.ts e2e-internal/e2e/isolation-mode-args.spec.ts
 */

const storybookUrl = (
  process.env.FORGE_SANDBOX_URL ||
  process.env.STORYBOOK_URL ||
  'http://localhost:6006'
).replace(/\/+$/, '');

/** Example/Button Primary, args `primary: true, label: 'Button'`. */
const STORY_ID = 'example-button--primary';

/** The internal Storybook can take a while to compile the first preview story on cold start. */
const PREVIEW_READY_TIMEOUT = 30_000;

/** Everything the change adds is awaited with a short explicit timeout. */
const OPENED_TAB_TIMEOUT = 10_000;

/** The args part of an address, as a sorted list of `name:value` pairs. */
function argsPairs(url: string): string[] {
  let args: string | null = null;
  try {
    args = new URL(url).searchParams.get('args');
  } catch {
    return [];
  }
  return args ? args.split(';').sort() : [];
}

/**
 * Given: Example/Button Primary is open in story view and Storybook's own address carries
 * `addressArgs` in its args part — the state a person reaches by editing the controls (clearing the
 * Label control puts `label:` there, turning Primary off adds `primary:!false`).
 */
async function openStoryWithArgs(page: Page, addressArgs: string): Promise<void> {
  await page.goto(`${storybookUrl}/?path=/story/${STORY_ID}${addressArgs ? `&args=${addressArgs}` : ''}`);
  await expect(page.getByRole('progressbar', { name: 'Content is loading...' })).toBeHidden({
    timeout: PREVIEW_READY_TIMEOUT,
  });
  await expect(page.getByRole('button', { name: 'Open in isolation mode' })).toBeVisible({
    timeout: PREVIEW_READY_TIMEOUT,
  });
  // The manager rewrites its own args part once the story has loaded; wait for that to settle.
  await expect
    .poll(() => argsPairs(page.url()), { timeout: PREVIEW_READY_TIMEOUT })
    .toEqual(addressArgs ? addressArgs.split(';').sort() : []);
}

/** When: the person uses the toolbar button "Open in isolation mode". */
async function openInIsolationMode(page: Page, context: BrowserContext): Promise<Page> {
  const [opened] = await Promise.all([
    context.waitForEvent('page', { timeout: OPENED_TAB_TIMEOUT }),
    page.getByRole('button', { name: 'Open in isolation mode' }).click(),
  ]);
  // The new tab starts out blank; wait until its address is the preview the button opened.
  await expect.poll(() => opened.url(), { timeout: OPENED_TAB_TIMEOUT }).toContain(`id=${STORY_ID}`);
  return opened;
}

/**
 * The args parts Storybook's own address can carry for Example/Button Primary: an emptied value
 * alone, ordinary non-empty values, and emptied values next to non-empty ones.
 */
const ADDRESS_ARGS_CASES = [
  'label:', // the emptied Label control alone
  'label:Ship', // an ordinary non-empty value
  'primary:!false', // Primary turned off
  'label:;primary:!false', // an emptied value together with a non-empty one
  'label:Ship;primary:!false', // two non-empty values
  'backgroundColor:red;label:', // a non-empty value together with an emptied one
];

test.describe('open in isolation mode', () => {
  test.setTimeout(120_000);

  test('AC-01 an emptied Label reaches the tab opened in isolation mode', async ({
    page,
    context,
  }) => {
    // Given: the Label control has been cleared, so Storybook's address carries args=label:
    await openStoryWithArgs(page, 'label:');

    // When: the person uses the toolbar button Open in isolation mode
    const opened = await openInIsolationMode(page, context);

    // Then: the new tab's address contains args=label: and the button in it has no text
    await expect
      .poll(() => argsPairs(opened.url()), { timeout: OPENED_TAB_TIMEOUT })
      .toContain('label:');
    const renderedButton = opened.getByRole('button').first();
    await expect(renderedButton).toBeVisible({ timeout: 5000 });
    await expect(renderedButton).toHaveText('', { timeout: 5000 });
  });

  test('AC-02 a Label set to Ship reaches the tab opened in isolation mode', async ({
    page,
    context,
  }) => {
    // Given: the Label control is set to Ship, so Storybook's address carries args=label:Ship
    await openStoryWithArgs(page, 'label:Ship');

    // When: the person uses the toolbar button Open in isolation mode
    const opened = await openInIsolationMode(page, context);

    // Then: the new tab's address contains args=label:Ship and the button in it reads Ship
    await expect
      .poll(() => argsPairs(opened.url()), { timeout: OPENED_TAB_TIMEOUT })
      .toContain('label:Ship');
    await expect(opened.getByRole('button', { name: 'Ship', exact: true })).toBeVisible({
      timeout: 5000,
    });
  });

  test('AC-03 every args pair in Storybook address is carried into the opened tab', async ({
    page,
    context,
  }) => {
    // Six args parts, one tab each, so one assertion can report every pair that was dropped.
    test.setTimeout(240_000);
    const carried: { addressArgs: string; address: string[]; opened: string[] }[] = [];

    for (const addressArgs of ADDRESS_ARGS_CASES) {
      // Given: Storybook's own address carries this args part for the current story
      await openStoryWithArgs(page, addressArgs);
      const address = argsPairs(page.url());

      // When: the person uses the toolbar button Open in isolation mode
      const opened = await openInIsolationMode(page, context);

      carried.push({ addressArgs, address, opened: argsPairs(opened.url()) });
      await opened.close();
    }

    // Then: the opened tab's args part carries every pair of Storybook's, name and value unchanged
    const dropped = carried
      .filter(({ address, opened }) => !address.every((pair) => opened.includes(pair)))
      .map(
        ({ addressArgs, address, opened }) =>
          `${addressArgs}: address carries [${address.join(';')}], opened tab carries [${opened.join(';')}]`
      );
    expect(dropped).toEqual([]);
  });

  test('AC-04 a story with no args in the address opens a tab with no args part', async ({
    page,
    context,
  }) => {
    // Given: no control has been changed, so Storybook's address has no args part
    await openStoryWithArgs(page, '');

    // When: the person uses the toolbar button Open in isolation mode
    const opened = await openInIsolationMode(page, context);

    // Then: the new tab's address has no args part at all and the button in it reads Button
    await expect.poll(() => argsPairs(opened.url()), { timeout: OPENED_TAB_TIMEOUT }).toEqual([]);
    expect(opened.url()).not.toContain('args=');
    await expect(opened.getByRole('button', { name: 'Button', exact: true })).toBeVisible({
      timeout: 5000,
    });
  });
});
