import type { Options } from 'storybook/internal/types';

import type { FrameworkOptions } from '../types.ts';

export const SVELTE_BUILDER_DOCGEN_DEPRECATION =
  'Builder docgen (the `docgen` option of `@storybook/svelte-vite` and `@storybook/sveltekit`) is deprecated and will be removed in Storybook 12. ' +
  'It runs because `features.docgenServer` is off. Remove `docgenServer: false` from your `.storybook/main.ts` to use server-side docgen.';

export const SVELTE_DOCGEN_NEEDS_TYPESCRIPT =
  'Svelte component docs need the `typescript` package, which this project does not have. ' +
  'Install `typescript` to get argTypes and descriptions from your components.';

export function isTypeScriptInstalled() {
  try {
    import.meta.resolve('typescript');
    return true;
  } catch {
    return false;
  }
}

export async function resolveDocgenContext(options: Options) {
  const [frameworkOptions, features] = await Promise.all([
    options.presets.apply<FrameworkOptions | null>('frameworkOptions'),
    options.presets.apply('features', {}),
  ]);

  return {
    docgen: frameworkOptions?.docgen !== false,
    docgenServerActive: features?.docgenServer === true,
  };
}
