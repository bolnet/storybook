import { expect, test, type Page } from '@playwright/test';
import process from 'process';

/**
 * Acceptance tests for "Empty-string args survive opening a story in a new tab".
 *
 * Each test drives the internal Storybook in a browser: it clears the Label control on
 * Example / Button, Primary (story id `example-button--primary`), clicks the toolbar button
 * "Open in isolation mode", and reads the tab that opens. `window.open` is called with
 * `noopener`, so Chromium reports the tab as a new page on the browser context rather than as a
 * popup of the opener — hence `context.waitForEvent('page')`.
 */

const storybookUrl = (
  process.env.FORGE_SANDBOX_URL ||
  process.env.STORYBOOK_URL ||
  'http://localhost:6006'
).replace(/\/$/, '');

/** The internal Storybook can take a while to compile the first preview story on cold start. */
const STORY_LOAD_TIMEOUT = 30_000;
/** Everything this change adds is awaited with a short, explicit timeout. */
const CHANGE_TIMEOUT = 5_000;
/** The manager rewrites the address from the story's args through an idle callback. */
const ADDRESS_TIMEOUT = 15_000;

const STORY_PATH = '/story/example-button--primary';

/** The `args` parameter of an address, decoded, or '' when the address carries none. */
function argsParam(target: Page): string {
  return new URL(target.url()).searchParams.get('args') ?? '';
}

/** The `name:value` pairs of the `args` parameter of an address. */
function argsPairs(target: Page): string[] {
  const param = argsParam(target);
  return param === '' ? [] : param.split(';');
}

function controlRow(page: Page, argName: string) {
  const panel = page.getByRole('tabpanel', { name: 'Controls' });
  return panel
    .getByRole('row')
    .filter({ has: panel.getByRole('cell', { name: argName, exact: true }) });
}

/** Shows Example / Button, Primary with its Controls panel ready to drive. */
async function showPrimaryStory(page: Page) {
  await page.goto(`${storybookUrl}/?path=${STORY_PATH}`);
  await expect(page.getByRole('progressbar', { name: 'Content is loading...' })).toBeHidden({
    timeout: STORY_LOAD_TIMEOUT,
  });
  await page.getByRole('tab', { name: 'Controls' }).click();
  await expect(controlRow(page, 'label').getByRole('textbox')).toBeVisible({
    timeout: STORY_LOAD_TIMEOUT,
  });
}

/** Types into the Label text control; '' clears it, which sends an empty string. */
async function setLabel(page: Page, value: string) {
  await controlRow(page, 'label').getByRole('textbox').fill(value);
}

/** Picks a Size option, whether the inferred control is a radio group or a select. */
async function setSize(page: Page, value: string) {
  const row = controlRow(page, 'size');
  await expect(row).toBeVisible({ timeout: STORY_LOAD_TIMEOUT });
  const radio = row.getByRole('radio', { name: value, exact: true });
  if ((await radio.count()) > 0) {
    await radio.check();
  } else {
    await row.getByRole('combobox').selectOption(value);
  }
}

/** Turns the Primary switch off. */
async function clearPrimary(page: Page) {
  const row = controlRow(page, 'primary');
  await expect(row).toBeVisible({ timeout: STORY_LOAD_TIMEOUT });
  await row.getByRole('switch').uncheck();
}

/** Waits until the address of the current tab carries every pair the controls produced. */
async function waitForAddressPairs(page: Page, pairs: string[]) {
  for (const pair of pairs) {
    await expect.poll(() => argsPairs(page), { timeout: ADDRESS_TIMEOUT }).toContain(pair);
  }
}

/** Clicks the toolbar button and returns the tab it opens, once that tab is on the preview. */
async function openInIsolationMode(page: Page) {
  const opened = page.context().waitForEvent('page', { timeout: ADDRESS_TIMEOUT });
  await page.getByRole('button', { name: 'Open in isolation mode' }).click();
  const newPage = await opened;
  await newPage.waitForURL((url) => url.pathname.endsWith('iframe.html'), {
    timeout: ADDRESS_TIMEOUT,
  });
  return newPage;
}

test.describe('opening a story in isolation mode', () => {
  test.setTimeout(120_000);

  test('AC-01 the new tab address keeps an arg whose value is an empty string', async ({
    page,
  }) => {
    // Given the internal Storybook shows Example / Button, Primary with the Label control
    // cleared, so the address of the tab carries args=label:
    await showPrimaryStory(page);
    await setLabel(page, '');
    await waitForAddressPairs(page, ['label:']);

    // When the person clicks the toolbar button "Open in isolation mode"
    const newPage = await openInIsolationMode(page);

    // Then the address of the new tab contains args=label:
    expect(argsPairs(newPage), `address of the new tab: ${newPage.url()}`).toContain('label:');

    await newPage.close();
  });

  test('AC-02 the story in the new tab renders with the empty label it was opened with', async ({
    page,
  }) => {
    // Given the internal Storybook shows Example / Button, Primary with the Label control
    // cleared, so the address of the tab carries args=label:
    await showPrimaryStory(page);
    await setLabel(page, '');
    await waitForAddressPairs(page, ['label:']);

    // When the person clicks the toolbar button "Open in isolation mode"
    const newPage = await openInIsolationMode(page);

    // Then the button in the new tab's page has no text
    const storyButton = newPage.getByRole('button').first();
    await expect(storyButton).toBeVisible({ timeout: STORY_LOAD_TIMEOUT });
    await expect(storyButton).toBeEmpty({ timeout: CHANGE_TIMEOUT });
    await expect(newPage.getByRole('button', { name: 'Button' })).toHaveCount(0, {
      timeout: CHANGE_TIMEOUT,
    });

    await newPage.close();
  });

  // AC-03 is a property over every name/value pair in the args parameter of the current tab's
  // address, empty-valued or not. The repository has no property framework, so this is a table
  // across the domain: an empty value alone, the case AC-03 names to drive it with (Label cleared
  // and Size large), a value-carrying arg alone, a non-string arg alone, and an empty value
  // alongside a boolean. Each case reads the pairs the address actually holds and asserts the
  // opened tab carries every one of them, in any order.
  const CASES: { name: string; drive: (page: Page) => Promise<void>; expected: string[] }[] = [
    {
      name: 'label cleared',
      drive: async (page) => {
        await setLabel(page, '');
      },
      expected: ['label:'],
    },
    {
      name: 'label cleared and size large',
      drive: async (page) => {
        await setLabel(page, '');
        await setSize(page, 'large');
      },
      expected: ['label:', 'size:large'],
    },
    {
      name: 'label set to AC03Inherited',
      drive: async (page) => {
        await setLabel(page, 'AC03Inherited');
      },
      expected: ['label:AC03Inherited'],
    },
    {
      name: 'size small on its own',
      drive: async (page) => {
        await setSize(page, 'small');
      },
      expected: ['size:small'],
    },
    {
      name: 'label cleared and primary off',
      drive: async (page) => {
        await setLabel(page, '');
        await clearPrimary(page);
      },
      expected: ['label:', 'primary:!false'],
    },
  ];

  test('AC-03 the opened tab carries over every arg pair in the current address', async ({
    page,
  }) => {
    // Five reloads of the story, each with its own controls to set and its own opened tab.
    test.setTimeout(300_000);

    for (const testCase of CASES) {
      // Given Example / Button, Primary with this case's controls set, so the address of the
      // tab carries that case's pairs
      await showPrimaryStory(page);
      await testCase.drive(page);
      await waitForAddressPairs(page, testCase.expected);
      const currentPairs = argsPairs(page);

      // When the person clicks the toolbar button "Open in isolation mode"
      const newPage = await openInIsolationMode(page);

      // Then the address of the new tab contains every one of those pairs, in any order
      const openedPairs = argsPairs(newPage);
      for (const pair of currentPairs) {
        expect(
          openedPairs,
          `${testCase.name}: current address ${page.url()} opened ${newPage.url()}`
        ).toContain(pair);
      }

      await newPage.close();
    }
  });
});
