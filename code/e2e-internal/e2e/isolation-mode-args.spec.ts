import process from 'process';

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { waitForPreviewReady } from '../helpers.ts';

/**
 * Acceptance tests for "Keep empty string arguments in the link that opens a story in a new tab".
 *
 * AC-01 clearing a text argument and opening isolation mode shows it empty in the new tab.
 * AC-02 an empty argument already in the manager address reaches the new tab's address.
 * AC-03 the new tab's address carries exactly the manager address's argument pairs.
 *
 * The toolbar button opens the story through `window.open`, so each test reads the opened tab as a
 * page of the same browser context.
 */

const storybookUrl = (
  process.env.FORGE_SANDBOX_URL ||
  process.env.STORYBOOK_URL ||
  'http://localhost:6006'
).replace(/\/+$/, '');

/** Renders every current argument as JSON inside `<pre data-testid="pre">`; `text` starts as `hello`. */
const STORY_ID = 'core-controls-basics--defined';

/** The `args` query parameter of an address as sorted name/value pairs; `null` when it has none. */
function argPairs(href: string): [string, string][] | null {
  const segment = new URL(href).searchParams.get('args');

  if (segment === null) {
    return null;
  }
  return segment
    .split(';')
    .map((pair) => {
      const colon = pair.indexOf(':');
      return (colon === -1 ? [pair, ''] : [pair.slice(0, colon), pair.slice(colon + 1)]) as [
        string,
        string,
      ];
    })
    .sort(([a], [b]) => (a < b ? -1 : 1));
}

/**
 * Waits until the manager has stopped rewriting its own address. The args sync runs on an idle
 * callback with a 1s timeout after the preview reports its arguments, so the address a click would
 * inherit from is only final once `location.search` has held still for longer than that.
 */
async function waitForAddressSettled(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const probe = window as unknown as { __settle?: { search: string; since: number } };
        const { search } = window.location;

        if (!probe.__settle || probe.__settle.search !== search) {
          probe.__settle = { search, since: Date.now() };
          return false;
        }
        return Date.now() - probe.__settle.since > 1500;
      },
      undefined,
      { timeout: 25_000 }
    )
    .catch(() => undefined);
}

/** Opens the Controls panel, dismissing the colour picker that one control opens by itself. */
async function openControlsPanel(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: /^Controls/ }).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click();

  const picker = page.getByRole('dialog').first();

  if (await picker.isVisible()) {
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => undefined);
  }
}

/**
 * Clicks "Open in isolation mode" in the preview toolbar and returns the tab it opened, or null
 * when no tab appeared. Returning null rather than throwing keeps the criterion's own assertion the
 * thing that fails.
 */
async function openInIsolationMode(page: Page): Promise<Page | null> {
  const opened = page
    .context()
    .waitForEvent('page', { timeout: 20_000 })
    .catch(() => null);

  const button = page.getByRole('button', { name: 'Open in isolation mode' });
  await expect(button).toBeVisible({ timeout: 20_000 });
  await button.click();

  const tab = await opened;

  if (tab) {
    await tab
      .waitForURL((url) => url.href !== 'about:blank', { waitUntil: 'commit', timeout: 20_000 })
      .catch(() => undefined);
  }
  return tab;
}

test.describe('open in isolation mode keeps empty string arguments', () => {
  test('AC-01 the new tab shows a cleared text argument as empty', async ({ page }) => {
    test.setTimeout(150_000);

    // Given the internal Storybook showing core-controls-basics--defined, whose text arg is "hello"
    await page.goto(`${storybookUrl}/?path=/story/${STORY_ID}`);
    await waitForPreviewReady(page);
    await openControlsPanel(page);
    const textControl = page.getByPlaceholder('Edit string...').first();
    await expect(textControl).toHaveValue('hello', { timeout: 20_000 });

    // When the person clears the text field, waits for the address to settle, and opens isolation mode
    await textControl.fill('');
    await expect(page).toHaveURL(/args=text:(?:&|$)/, { timeout: 20_000 });
    await waitForAddressSettled(page);
    const isolated = await openInIsolationMode(page);

    // Then the story rendered in the new tab shows "text": "", not "text": "hello"
    const rendered = isolated
      ? isolated.getByTestId('pre')
      : page.getByTestId('no-isolation-tab-opened');
    await expect(rendered).toContainText('"text": ""', { timeout: 30_000 });
    await expect(rendered).not.toContainText('"text": "hello"');
  });

  test('AC-02 an empty argument in the manager address reaches the new tab address', async ({
    page,
  }) => {
    test.setTimeout(150_000);

    // Given the manager opened at ?path=/story/core-controls-basics--defined&args=text:
    await page.goto(`${storybookUrl}/?path=/story/${STORY_ID}&args=text:`);
    await waitForPreviewReady(page);
    await expect(page).toHaveURL(/args=text:(?:&|$)/, { timeout: 20_000 });
    await waitForAddressSettled(page);
    await expect(page).toHaveURL(/args=text:(?:&|$)/, { timeout: 20_000 });

    // When the person clicks "Open in isolation mode"
    const isolated = await openInIsolationMode(page);

    // Then the new tab's address contains args=text:
    const address = isolated ? decodeURIComponent(isolated.url()) : 'no isolation tab opened';
    expect(address).toContain('args=text:');
  });

  /**
   * AC-03, a property over the arguments segments a person can put in the manager address: every
   * case runs in one test so the whole table is the oracle, not just the cases that already hold.
   */
  const ARG_SEGMENTS: (string | null)[] = [
    null,
    'text:hi',
    'text:',
    'number:5;text:',
    'text:;select:c',
  ];

  test('AC-03 the new tab carries every argument pair of the manager address', async ({ page }) => {
    test.setTimeout(420_000);

    const fromManager: string[] = [];
    const fromNewTab: string[] = [];

    for (const segment of ARG_SEGMENTS) {
      const label = segment === null ? 'no args at all' : segment;

      // Given the manager opened with this arguments segment, with the address settled
      await page.goto(
        `${storybookUrl}/?path=/story/${STORY_ID}${segment === null ? '' : `&args=${segment}`}`
      );
      await waitForPreviewReady(page);
      await waitForAddressSettled(page);
      const managerPairs = argPairs(page.url());

      // When the person clicks "Open in isolation mode"
      const isolated = await openInIsolationMode(page);
      const newTabPairs = isolated ? argPairs(isolated.url()) : 'no isolation tab opened';

      if (isolated) {
        await isolated.close();
      }

      // Then the new tab carries the same pairs, and no args parameter when the manager has none
      fromManager.push(`${label} -> ${JSON.stringify(managerPairs)}`);
      fromNewTab.push(`${label} -> ${JSON.stringify(newTabPairs)}`);
    }

    expect(fromNewTab).toEqual(fromManager);
  });
});
