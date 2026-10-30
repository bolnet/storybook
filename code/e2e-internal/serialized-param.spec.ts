import { expect, test } from '@playwright/test';

/**
 * Unit tests for the reader of the args/globals URL params, moved to its own module at
 * `code/core/src/manager-api/lib/serialized-param.ts`. Reached through a dynamic import so that
 * before that module exists, every test below falls back to a stub and fails on its `expect`
 * rather than on a missing module.
 */

type Pairs = Record<string, string>;

interface SerializedParamModule {
  parseSerializedParam?: (param: string) => Pairs;
  mergeSerializedParams?: (params: string, extraParams: string) => string;
}

async function loadSerializedParam(): Promise<{
  parseSerializedParam: (param: string) => Pairs;
  mergeSerializedParams: (params: string, extraParams: string) => string;
}> {
  const mod: SerializedParamModule =
    await import('../core/src/manager-api/lib/serialized-param.ts').catch(() => ({}));
  return {
    parseSerializedParam: mod.parseSerializedParam ?? (() => ({ __stub__: 'missing-module' })),
    mergeSerializedParams: mod.mergeSerializedParams ?? (() => '__stub__:missing-module'),
  };
}

test.describe('the serialized args and globals reader', () => {
  test('reads a pair whose value is an empty string', async () => {
    const { parseSerializedParam } = await loadSerializedParam();
    expect(parseSerializedParam('label:')).toStrictEqual({ label: '' });
  });

  test('reads two pairs whose values are both empty', async () => {
    const { parseSerializedParam } = await loadSerializedParam();
    expect(parseSerializedParam('label:;size:')).toStrictEqual({ label: '', size: '' });
  });

  test('drops a pair whose name is empty', async () => {
    const { parseSerializedParam } = await loadSerializedParam();
    expect(parseSerializedParam(':orphan')).toStrictEqual({});
  });

  test('reads nothing out of an empty param', async () => {
    const { parseSerializedParam } = await loadSerializedParam();
    expect(parseSerializedParam('')).toStrictEqual({});
  });

  test('merges nothing out of two empty params', async () => {
    const { mergeSerializedParams } = await loadSerializedParam();
    expect(mergeSerializedParams('', '')).toBe('');
  });

  test('encodes values the way it did before', async () => {
    const { parseSerializedParam } = await loadSerializedParam();
    // encodeURIComponent('g=h') === 'g%3Dh', matching the pre-existing encoding step.
    expect(parseSerializedParam('equal:g=h')).toStrictEqual({ equal: 'g%3Dh' });
  });

  test('keeps a pair with no colon the way it did before', async () => {
    const { parseSerializedParam } = await loadSerializedParam();
    // No colon means `value` is `undefined`, and encodeURIComponent(undefined) === 'undefined'.
    expect(parseSerializedParam('justkey')).toStrictEqual({ justkey: 'undefined' });
  });

  test('merges an extra empty value over an existing value', async () => {
    const { mergeSerializedParams } = await loadSerializedParam();
    expect(mergeSerializedParams('label:x', 'label:')).toBe('label:');
  });

  test('merges an extra value over an existing empty value', async () => {
    const { mergeSerializedParams } = await loadSerializedParam();
    expect(mergeSerializedParams('label:', 'label:y')).toBe('label:y');
  });

  test('merges two empty-valued pairs beside a pair that carries a value', async () => {
    const { mergeSerializedParams } = await loadSerializedParam();
    expect(mergeSerializedParams('label:;size:;color:red', '')).toBe('label:;size:;color:red');
  });

  test('merges pairs that carry values exactly as before', async () => {
    const { mergeSerializedParams } = await loadSerializedParam();
    expect(mergeSerializedParams('a:1;b:2', 'c:3')).toBe('a:1;b:2;c:3');
  });
});
