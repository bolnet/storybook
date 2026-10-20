// @vitest-environment node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { buildDocgenPayload } from './build-docgen.ts';
import { createDocgenCache } from './svelte2tsx/generate-docgen.ts';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '__testfixtures__');

it('documents the subcomponents a meta lists', async () => {
  const payload = await buildDocgenPayload(
    {
      entry: {
        id: 'button--primary',
        name: 'Primary',
        title: 'Button',
        type: 'story',
        subtype: 'story',
        importPath: join(fixtures, 'subcomponents/svelte-csf.stories.svelte'),
        tags: [],
      },
    },
    { cache: createDocgenCache() }
  );
  expect(payload?.subcomponents?.Icon).toMatchObject({
    name: 'Icon',
    argTypes: { name: { name: 'name', type: { name: 'string', required: true } } },
  });
  expect(payload?.subcomponents?.Icon?.path).toBe(payload?.path);
});
