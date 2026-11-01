import process from 'process';

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { waitForPreviewReady } from './helpers.ts';

/**
 * Checks that url.ts's parseSerializedParam keeps an args/globals pair whose value is the empty
 * string when it builds the href for the toolbar button "Open in isolation mode". Stubs
 * window.open so the handler's href is recorded and no tab actually opens.
 *
 * Run locally (from repo root) with internal Storybook on port 6006:
 *   cd code && yarn storybook:ui
 *   yarn playwright test -c e2e-internal/playwright.config.ts e2e-internal/isolation-mode-href.spec.ts
 */

const storybookUrl = (process.env.STORYBOOK_URL || 'http://localhost:6006').replace(/\/+$/, '');

/** Example/Button Primary, args `primary: true, label: 'Button'`. */
const STORY_ID = 'example-button--primary';

/** The internal Storybook can take a while to compile the first preview story on cold start. */
const PREVIEW_READY_TIMEOUT = 30_000;

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

/** Records every href passed to window.open instead of actually opening a tab. */
async function stubWindowOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__openedHrefs = [];
    (window as any).open = (href?: string) => {
      (window as any).__openedHrefs.push(String(href ?? ''));
      return null;
    };
  });
}

/**
 * Given: Example/Button Primary is open in story view and Storybook's own address carries
 * `addressArgs` in its args part — the state a person reaches by editing the controls (clearing
 * the Label control puts `label:` there, turning Primary off adds `primary:!false`).
 */
async function openStoryWithArgs(page: Page, addressArgs: string): Promise<void> {
  await page.goto(
    `${storybookUrl}/?path=/story/${STORY_ID}${addressArgs ? `&args=${addressArgs}` : ''}`
  );
  await waitForPreviewReady(page);
  await expect(page.getByRole('button', { name: 'Open in isolation mode' })).toBeVisible({
    timeout: PREVIEW_READY_TIMEOUT,
  });
  // The manager rewrites its own args part once the story has loaded; wait for that to settle.
  await expect
    .poll(() => argsPairs(page.url()), { timeout: PREVIEW_READY_TIMEOUT })
    .toEqual(addressArgs ? addressArgs.split(';').sort() : []);
}

/**
 * When: the person clicks the toolbar button "Open in isolation mode". Returns the href that
 * window.open was called with for this click (window.open is stubbed by stubWindowOpen).
 */
async function clickOpenInIsolationModeAndGetHref(page: Page): Promise<string> {
  const before = await page.evaluate(() => (window as any).__openedHrefs.length);
  await page.getByRole('button', { name: 'Open in isolation mode' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__openedHrefs.length))
    .toBeGreaterThan(before);
  return page.evaluate(() => (window as any).__openedHrefs.at(-1));
}

test.describe('isolation mode href', () => {
  test.setTimeout(60_000);

  test('an emptied arg is carried into the href the toolbar button opens', async ({ page }) => {
    // Given: the Label control has been cleared, so Storybook's address carries args=label:
    await stubWindowOpen(page);
    await openStoryWithArgs(page, 'label:');

    // When: the person clicks Open in isolation mode
    const href = await clickOpenInIsolationModeAndGetHref(page);

    // Then: the recorded href's args part still carries label:
    expect(argsPairs(href)).toContain('label:');
  });

  test('an emptied arg and a non-empty arg are both carried in one href', async ({ page }) => {
    // Given: the address carries an emptied Label alongside Primary turned off
    await stubWindowOpen(page);
    await openStoryWithArgs(page, 'label:;primary:!false');

    // When: the person clicks Open in isolation mode
    const href = await clickOpenInIsolationModeAndGetHref(page);

    // Then: the recorded href's args part carries both pairs, name and value unchanged
    expect(argsPairs(href)).toEqual(['label:', 'primary:!false'].sort());
  });

  test('every args pair of the address is carried into the href with the same name and value', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Six args parts, one href each, so one assertion can report every pair that was dropped.
    const ADDRESS_ARGS_CASES = [
      '', // no args at all
      'label:', // the emptied Label control alone
      'label:Ship', // an ordinary non-empty value
      'primary:!false', // Primary turned off
      'label:;primary:!false', // an emptied value together with a non-empty one
      'backgroundColor:red;label:', // a non-empty value together with an emptied one
    ];

    await stubWindowOpen(page);

    const results: { addressArgs: string; address: string[]; href: string }[] = [];
    for (const addressArgs of ADDRESS_ARGS_CASES) {
      // Given: Storybook's own address carries this args part for the current story
      await openStoryWithArgs(page, addressArgs);
      const address = argsPairs(page.url());

      // When: the person clicks Open in isolation mode
      const href = await clickOpenInIsolationModeAndGetHref(page);

      results.push({ addressArgs, address, href });
    }

    // Then: every pair of Storybook's own address shows up, unchanged, in the recorded href's args
    // part, and the empty address produces a href with no args= part at all.
    const violations = results.flatMap(({ addressArgs, address, href }) => {
      const hrefPairs = argsPairs(href);
      const missing = address.filter((pair) => !hrefPairs.includes(pair));
      const notes: string[] = [];
      if (missing.length > 0) {
        notes.push(
          `${addressArgs || '(empty)'}: href dropped [${missing.join(';')}], href carried [${hrefPairs.join(';')}]`
        );
      }
      if (addressArgs === '' && href.includes('args=')) {
        notes.push(
          `${addressArgs || '(empty)'}: href has an args= part though the address had none`
        );
      }
      return notes;
    });

    expect(violations).toEqual([]);
  });
});
