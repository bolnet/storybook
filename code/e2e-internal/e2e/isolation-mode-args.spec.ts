import process from 'process';

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { waitForPreviewReady } from '../helpers.ts';

/**
 * Acceptance tests for "Keep empty string arguments in the link that opens a story in a new tab".
 *
 * AC-01 clearing a text argument and opening isolation mode shows that argument empty in the new tab.
 * AC-02 an empty argument already carried in the manager address reaches the new tab's address.
 * AC-03 the new tab's address carries exactly the argument pairs of the manager address.
 *
 * The toolbar button opens the story with `window.open(..., 'noopener')`, so each test reads the
 * opened tab as a new page of the same browser context rather than as a popup of this page.
 */

const storybookUrl = (
  process.env.FORGE_SANDBOX_URL ||
  process.env.STORYBOOK_URL ||
  'http://localhost:6006'
).replace(/\/+$/, '');

/** Renders every current argument as JSON inside `<pre data-testid="pre">`; `text` starts as `hello`. */
const STORY_ID = 'core-controls-basics--defined';

/** An arguments segment (`text:;select:c`) as sorted name/value pairs; `null` when there is none. */
function segmentPairs(segment: string | null): [string, string][] | null {
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

/** The `args` query parameter of an address as sorted name/value pairs; `null` when it carries none. */
function argPairs(href: string): [string, string][] | null {
  return segmentPairs(new URL(href).searchParams.get('args'));
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
      { timeout: 30_000 }
    )
    .catch(() => undefined);
}

/** Opens the Controls panel, dismissing the colour picker one control of this story opens by itself. */
async function openControlsPanel(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: /^Controls/ }).first();
  await expect(tab).toBeVisible({ timeout: 30_000 });
  await tab.click();

  const picker = page.getByRole('dialog').first();

  if (await picker.isVisible()) {
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => undefined);
  }
}

/**
 * Clicks "Open in isolation mode" in the preview toolbar and returns the tab it opened, or null when
 * no tab appeared. Returning null rather than throwing keeps the criterion's own assertion the thing
 * that fails.
 */
async function openInIsolationMode(page: Page): Promise<Page | null> {
  const opened = page
    .context()
    .waitForEvent('page', { timeout: 20_000 })
    .catch(() => null);

  const button = page.getByRole('button', { name: 'Open in isolation mode' });
  await expect(button).toBeVisible({ timeout: 30_000 });
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
    test.setTimeout(180_000);

    // Given the internal Storybook showing core-controls-basics--defined, whose text arg is "hello"
    await page.goto(`${storybookUrl}/?path=/story/${STORY_ID}`);
    await waitForPreviewReady(page);
    await openControlsPanel(page);
    const textControl = page.getByPlaceholder('Edit string...').first();
    await expect(textControl).toHaveValue('hello', { timeout: 30_000 });

    // When the person clears the text field, waits for the address to settle, and opens isolation mode
    await textControl.fill('');
    await expect(textControl).toHaveValue('', { timeout: 20_000 });
    await page
      .waitForURL((url) => url.search.includes('args=text:'), { timeout: 20_000 })
      .catch(() => undefined);
    await waitForAddressSettled(page);
    const managerAddress = page.url();
    const isolated = await openInIsolationMode(page);

    // Then the story rendered in the new tab shows "text": "", not "text": "hello"
    const rendered = isolated
      ? isolated.getByTestId('pre')
      : page.getByTestId('no-isolation-tab-was-opened');
    const where = `manager address at the click: ${managerAddress}`;
    await expect(rendered, where).toContainText('"text": ""', { timeout: 20_000 });
    await expect(rendered, where).not.toContainText('"text": "hello"');
  });

  test('AC-02 an empty argument in the manager address reaches the new tab address', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Given the manager opened at ?path=/story/core-controls-basics--defined&args=text:, settled
    await page.goto(`${storybookUrl}/?path=/story/${STORY_ID}&args=text:`);
    await waitForPreviewReady(page);
    await waitForAddressSettled(page);
    const managerAddress = page.url();

    // When the person clicks "Open in isolation mode"
    const isolated = await openInIsolationMode(page);

    // Then the new tab's address contains args=text:
    const newTabAddress = isolated ? isolated.url() : 'no isolation tab was opened';
    expect(newTabAddress, `manager address at the click: ${managerAddress}`).toContain(
      'args=text:'
    );
  });

  /**
   * AC-03, a property over the arguments segments a person can put in the manager address. Every
   * case runs in one test so the oracle is the whole table, not only the cases that already hold at
   * the base commit. Each case expects the new tab to carry the pairs of the segment the manager was
   * opened with, which is what the manager's own address carries once it has settled; the address at
   * the moment of the click is reported alongside so a mismatch says where the pair was lost.
   */
  const ARG_SEGMENTS: (string | null)[] = [
    null,
    'text:hi',
    'text:',
    'number:5;text:',
    'text:;select:c',
  ];

  test('AC-03 the new tab carries every argument pair of the manager address', async ({ page }) => {
    test.setTimeout(480_000);

    const expected: string[] = [];
    const actual: string[] = [];
    const managerAddresses: string[] = [];

    for (const segment of ARG_SEGMENTS) {
      const label = segment === null ? 'no args at all' : segment;

      // Given the manager opened with this arguments segment, with the address settled
      await page.goto(
        `${storybookUrl}/?path=/story/${STORY_ID}${segment === null ? '' : `&args=${segment}`}`
      );
      await waitForPreviewReady(page);
      await waitForAddressSettled(page);
      managerAddresses.push(`${label} -> ${page.url()}`);

      // When the person clicks "Open in isolation mode"
      const isolated = await openInIsolationMode(page);
      const newTabPairs: unknown = isolated ? argPairs(isolated.url()) : 'no isolation tab opened';

      if (isolated) {
        await isolated.close();
      }

      // Then the new tab carries the same pairs, and no args parameter when the manager has none
      expected.push(`${label} -> ${JSON.stringify(segmentPairs(segment))}`);
      actual.push(`${label} -> ${JSON.stringify(newTabPairs)}`);
    }

    expect(actual, `manager addresses at the click: ${managerAddresses.join(' | ')}`).toEqual(
      expected
    );
  });
});
