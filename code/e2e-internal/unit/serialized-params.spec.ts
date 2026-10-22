import { expect, test } from '@playwright/test';

/**
 * Unit tests for `mergeSerializedParams`, exported from `code/core/src/manager-api/lib/url.ts`
 * (storybookjs/storybook#36356).
 *
 * The helper does not exist at `lib/url.ts` yet at the base commit, so each test reaches it through
 * a dynamic import that is caught rather than a static one: that keeps every test in this file
 * collectible and failing on its `expect`, never on a module-resolution error.
 */

async function getMergeSerializedParams() {
  const mod = await import('../../core/src/manager-api/lib/url.ts').catch(() => ({}));
  return (mod as any).mergeSerializedParams ?? (() => undefined);
}

test.describe('mergeSerializedParams', () => {
  test('keeps a pair whose value is an empty string', async () => {
    const mergeSerializedParams = await getMergeSerializedParams();

    expect(mergeSerializedParams('label:', '')).toBe('label:');
  });

  test('keeps two empty-valued pairs in one parameter', async () => {
    const mergeSerializedParams = await getMergeSerializedParams();

    expect(mergeSerializedParams('text:;radio:', '')).toBe('text:;radio:');
  });

  test('returns an empty string for an empty parameter', async () => {
    const mergeSerializedParams = await getMergeSerializedParams();

    expect(mergeSerializedParams('', '')).toBe('');
  });

  test('discards a pair whose key is empty and keeps the pair beside it', async () => {
    const mergeSerializedParams = await getMergeSerializedParams();

    expect(mergeSerializedParams(':x;label:hello', '')).toBe('label:hello');
  });

  test('builds no pair from a lone separator', async () => {
    const mergeSerializedParams = await getMergeSerializedParams();

    expect(mergeSerializedParams(';', '')).toBe('');
  });

  test('lets an empty extra value override the inherited value', async () => {
    const mergeSerializedParams = await getMergeSerializedParams();

    expect(mergeSerializedParams('label:hello', 'label:')).toBe('label:');
  });

  test('lets a non-empty extra value override an inherited empty value', async () => {
    const mergeSerializedParams = await getMergeSerializedParams();

    expect(mergeSerializedParams('label:', 'label:world')).toBe('label:world');
  });

  test('re-encodes a decoded value as it does today', async () => {
    const mergeSerializedParams = await getMergeSerializedParams();

    expect(mergeSerializedParams('equal:g=h', '')).toBe('equal:g%3Dh');
  });

  test('keeps the current form of a pair written without a colon', async () => {
    const mergeSerializedParams = await getMergeSerializedParams();

    expect(mergeSerializedParams('abc', '')).toBe('abc:undefined');
  });
});
