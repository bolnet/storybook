import { expect, test, type Page } from '@playwright/test';
import process from 'process';

/**
 * Covers the args merge step in parseSerializedParam/mergeSerializedParams
 * (code/core/src/manager-api/modules/url.ts), which getStoryHrefs and the
 * openInIsolation shortcut both go through when they build the link that opens a
 * story in a new tab. These tests exercise that step with more than one args pair
 * at once, and through the keyboard shortcut as well as the toolbar button, so a
 * fix that only keeps the empty value for a single pair or only for the button
 * still fails here.
 */

const storybookUrl = (process.env.STORYBOOK_URL || 'http://localhost:6006').replace(/\/+$/, '');

/** Controls / Basics, Defined. `text` starts as `hello`, `select` starts as `b`. */
const STORY_ID = 'core-controls-basics--defined';

const STORY_READY_TIMEOUT = 60_000;
const ADDRESS_TIMEOUT = 15_000;
const PRESS_SETTLE_TIMEOUT = 3_000;

declare global {
  interface Window {
    __forgeOpenedAddresses?: string[];
  }
}

/**
 * Records every address the page asks the browser to open a tab at, and still opens it. Must be
 * installed before `goto`.
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

/** True once at least one more tab has been opened since `before`. Never throws. */
async function tabOpenedSince(page: Page, before: number, timeout: number): Promise<boolean> {
  try {
    await expect
      .poll(async () => (await openedAddresses(page)).length, { timeout })
      .toBeGreaterThan(before);
    return true;
  } catch {
    return false;
  }
}

/** Opens Controls / Basics, Defined and waits until its preview and toolbar are usable. */
async function openDefinedStory(page: Page): Promise<void> {
  await recordOpenedAddresses(page);
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

/** The story's `select` control, found by its (visually hidden) label. */
function selectControl(page: Page) {
  return page.getByLabel('select', { exact: true });
}

/** Shows the Controls panel, so a person (and this test) can read and change its controls. */
async function showControlsPanel(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: /^Controls/ });
  await expect(tab).toBeVisible({ timeout: STORY_READY_TIMEOUT });
  await tab.click({ timeout: ADDRESS_TIMEOUT }).catch(() => undefined);
}

/** Clears/types `value` into the text control and waits until the control itself holds it. */
async function setTextControl(page: Page, value: string): Promise<void> {
  await showControlsPanel(page);
  const control = textControl(page);
  await expect(control).toHaveValue('hello', { timeout: STORY_READY_TIMEOUT });
  await control.fill(value, { timeout: ADDRESS_TIMEOUT }).catch(() => undefined);
  await expect(control).toHaveValue(value, { timeout: ADDRESS_TIMEOUT });
}

/** Picks `value` in the select control and waits until the control itself holds it. */
async function setSelectControl(page: Page, value: string): Promise<void> {
  await showControlsPanel(page);
  const control = selectControl(page);
  await expect(control).toHaveValue('b', { timeout: STORY_READY_TIMEOUT });
  await control.selectOption(value, { timeout: ADDRESS_TIMEOUT }).catch(() => undefined);
  await expect(control).toHaveValue(value, { timeout: ADDRESS_TIMEOUT });
}

/**
 * Presses the toolbar button Open in isolation mode and returns the address of the tab it opens.
 * Tolerant of being called more than once in the same test: it only waits for a tab opened after
 * this call started, not for any tab ever having opened.
 */
async function pressOpenInIsolationMode(page: Page): Promise<string> {
  const button = page.getByRole('button', { name: 'Open in isolation mode' });
  await expect(button).toBeVisible({ timeout: ADDRESS_TIMEOUT });

  const before = (await openedAddresses(page)).length;
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
    if (await tabOpenedSince(page, before, PRESS_SETTLE_TIMEOUT)) {
      break;
    }
  }

  const addresses = await openedAddresses(page);
  expect(addresses.length, 'pressing Open in isolation mode opens a new tab').toBeGreaterThan(
    before
  );
  return addresses[addresses.length - 1];
}

/** The `args` query parameter of `address`, as `{ name: value }` pairs, decoded. */
function argsPairs(address: string, base: string): Record<string, string> {
  const url = new URL(address, base);
  const value = url.searchParams.get('args') ?? '';
  const pairs: Record<string, string> = {};
  for (const part of value.split(';')) {
    const separator = part.indexOf(':');
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator);
    if (key) {
      pairs[key] = part.slice(separator + 1);
    }
  }
  return pairs;
}

/** The current page address's own `args` pairs. */
async function currentArgsPairs(page: Page): Promise<Record<string, string>> {
  return argsPairs(page.url(), page.url());
}

test.describe('Open in isolation mode link args', () => {
  // The internal Storybook compiles the first preview story on demand.
  test.setTimeout(120_000);

  test('keeps an empty value beside a value that is not empty in one link', async ({ page }) => {
    await openDefinedStory(page);
    await setTextControl(page, '');
    await setSelectControl(page, 'c');
    await expect
      .poll(() => currentArgsPairs(page), { timeout: ADDRESS_TIMEOUT })
      .toMatchObject({ text: '', select: 'c' });

    const address = await pressOpenInIsolationMode(page);
    const pairs = argsPairs(address, page.url());

    expect(pairs.text, 'the empty text arg survives beside a non-empty select arg').toBe('');
    expect(pairs.select, 'the non-empty select arg keeps its value in the same link').toBe('c');
  });

  test('nothing changed opens with no args and clearing the text control adds args=text:', async ({
    page,
  }) => {
    await openDefinedStory(page);
    await expect(page).not.toHaveURL(/[?&]args=/, { timeout: ADDRESS_TIMEOUT });

    const firstAddress = await pressOpenInIsolationMode(page);
    expect(
      new URL(firstAddress, page.url()).searchParams.has('args'),
      'nothing changed yields no args parameter'
    ).toBe(false);

    await setTextControl(page, '');
    await expect
      .poll(() => currentArgsPairs(page), { timeout: ADDRESS_TIMEOUT })
      .toMatchObject({ text: '' });

    const secondAddress = await pressOpenInIsolationMode(page);
    expect(
      argsPairs(secondAddress, page.url()).text,
      'clearing the text control adds args=text: to the next link'
    ).toBe('');
  });

  test('the open in isolation shortcut keeps the empty value too', async ({ page }) => {
    await openDefinedStory(page);
    await setTextControl(page, '');
    await expect
      .poll(() => currentArgsPairs(page), { timeout: ADDRESS_TIMEOUT })
      .toMatchObject({ text: '' });

    // Move focus off the text control onto a non-input element, so the manager's shortcut
    // handler does not skip the keystroke (it ignores keydowns targeting an input/textarea).
    const controlsTab = page.getByRole('tab', { name: /^Controls/ });
    await controlsTab.click({ timeout: ADDRESS_TIMEOUT }).catch(() => undefined);

    const before = (await openedAddresses(page)).length;
    await page.keyboard.press('Alt+Shift+I').catch(() => undefined);
    await tabOpenedSince(page, before, PRESS_SETTLE_TIMEOUT);

    const addresses = await openedAddresses(page);
    expect(addresses.length, 'the shortcut opens a new tab').toBeGreaterThan(before);
    const address = addresses[addresses.length - 1];

    expect(
      argsPairs(address, page.url()).text,
      'the shortcut keeps the empty text arg too'
    ).toBe('');
  });
});
