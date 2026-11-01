import process from 'process';

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

import { waitForPreviewReady } from './helpers.ts';

/**
 * Checks that FramesRenderer's SkipToSidebarLink hides the "Skip to sidebar" link in place
 * inside #storybook-preview-wrapper, the way the sidebar's own SkipToCanvasLink does, instead of
 * translating it 100px above the preview area where the wrapper clips it.
 *
 * Run locally (from repo root) with internal Storybook on port 6006:
 *   cd code && yarn storybook:ui
 *   yarn playwright test -c e2e-internal/playwright.config.ts e2e-internal/skip-to-sidebar-link.spec.ts
 */

const storybookUrl = (process.env.STORYBOOK_URL || 'http://localhost:6006').replace(/\/+$/, '');

/** Example/Button Primary, a plain story (not docs) so the link can be focused directly. */
const STORY_PATH = '/story/example-button--primary';

const PREVIEW_READY_TIMEOUT = 30_000;

function skipToSidebarLink(page: Page): Locator {
  return page.locator('#storybook-preview-wrapper').getByRole('link', { name: 'Skip to sidebar' });
}

async function wrapperBox(page: Page) {
  const box = await page.locator('#storybook-preview-wrapper').boundingBox();
  if (!box) {
    throw new Error('#storybook-preview-wrapper has no bounding box');
  }
  return box;
}

async function linkBox(link: Locator) {
  const box = await link.boundingBox();
  if (!box) {
    throw new Error('the skip to sidebar link has no bounding box');
  }
  return box;
}

async function opacityOf(link: Locator): Promise<number> {
  return link.evaluate((el) => Number(getComputedStyle(el).opacity));
}

/** Asserts the link's box sits inside the wrapper's own box, collapsed to at most 2x2px. */
async function expectHiddenInPlace(page: Page, link: Locator): Promise<void> {
  const wrapper = await wrapperBox(page);
  const box = await linkBox(link);

  expect(box.width).toBeLessThanOrEqual(2);
  expect(box.height).toBeLessThanOrEqual(2);
  expect(box.x).toBeGreaterThanOrEqual(wrapper.x - 1);
  expect(box.y).toBeGreaterThanOrEqual(wrapper.y - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(wrapper.x + wrapper.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(wrapper.y + wrapper.height + 1);
  expect(await opacityOf(link)).toBe(0);
}

test.describe('skip to sidebar link', () => {
  test.setTimeout(60_000);

  test('at the manager root the unfocused link is hidden inside the preview area', async ({
    page,
  }) => {
    // Given: the manager root, the address forge:ui_check captures (docs view mode)
    await page.goto(storybookUrl);
    await waitForPreviewReady(page);

    // Then: the link's box sits inside the wrapper's own box, collapsed and invisible
    await expectHiddenInPlace(page, skipToSidebarLink(page));
  });

  test('focusing the link shows a full-size button at the top right of the preview area', async ({
    page,
  }) => {
    await page.goto(`${storybookUrl}/?path=${STORY_PATH}`);
    await waitForPreviewReady(page);

    const link = skipToSidebarLink(page);

    // Given: the link starts out hidden in place
    await expectHiddenInPlace(page, link);

    // When: focus moves onto the link
    await link.focus();
    await expect.poll(() => opacityOf(link), { timeout: PREVIEW_READY_TIMEOUT }).toBe(1);

    // Then: it restores a real, full-size box anchored near the wrapper's top right corner
    const wrapper = await wrapperBox(page);
    const box = await linkBox(link);

    expect(box.width).toBeGreaterThanOrEqual(60);
    expect(box.height).toBeGreaterThanOrEqual(24);

    const topGap = box.y - wrapper.y;
    expect(topGap).toBeGreaterThanOrEqual(10 - 4);
    expect(topGap).toBeLessThanOrEqual(10 + 4);

    const rightGap = wrapper.x + wrapper.width - (box.x + box.width);
    expect(rightGap).toBeGreaterThanOrEqual(15 - 4);
    expect(rightGap).toBeLessThanOrEqual(15 + 4);

    await expect(link).toHaveText('Skip to sidebar');

    // When: focus moves on, to the sidebar search field
    await page.locator('#storybook-explorer-searchfield').focus();

    // Then: the link returns to hidden in place
    await expect.poll(() => opacityOf(link), { timeout: PREVIEW_READY_TIMEOUT }).toBe(0);
    await expectHiddenInPlace(page, link);
  });

  test('at 600px wide the hidden link is inside the preview area and at 599px it is not displayed', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto(`${storybookUrl}/?path=${STORY_PATH}`);
    await waitForPreviewReady(page);

    const link = skipToSidebarLink(page);

    // Then: at 600px wide the link is hidden in place inside the preview area
    await expectHiddenInPlace(page, link);

    // When: the viewport narrows below the breakpoint
    await page.setViewportSize({ width: 599, height: 800 });

    // Then: the link is not displayed at all
    await expect(link).not.toBeVisible();
  });
});
