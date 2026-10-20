import { readFile } from 'node:fs/promises';

import { preprocess } from 'svelte/compiler';

import type {
  DocgenPayload,
  DocgenProviderInput,
  DocgenSubcomponent,
} from 'storybook/internal/types';
import { getComponentIdFromEntry, getStoryImportPathFromEntry } from 'storybook/internal/common';
import { extractComponentDescription } from 'storybook/internal/csf-tools';

import { createServerArgTypes } from './arg-types/create-server-arg-types.ts';
import {
  resolveStoryComponent,
  resolveStorySubcomponents,
} from './resolve-component/resolve-component.ts';
import { generateDocgen, type DocgenCache } from './svelte2tsx/generate-docgen.ts';

export type BuildDocgenContext = { cache: DocgenCache };

export async function buildDocgenPayload(
  input: DocgenProviderInput,
  context: BuildDocgenContext
): Promise<DocgenPayload | undefined> {
  const path = getStoryImportPathFromEntry(input.entry);
  if (!path) return undefined;
  const base = {
    id: getComponentIdFromEntry(input.entry),
    name: input.entry.title.split('/').at(-1) ?? input.entry.title,
    path,
    jsDocTags: {},
    renderer: 'svelte',
  };
  try {
    const component = await resolveStoryComponent(input.entry);
    if (!component) return undefined;
    const docs = await componentDocs(component.componentPath, context);
    const subcomponents: Record<string, DocgenSubcomponent> = {};
    for (const [name, subcomponent] of Object.entries(
      await resolveStorySubcomponents(input.entry)
    )) {
      try {
        subcomponents[name] = {
          name,
          path,
          ...(await componentDocs(subcomponent.componentPath, context)),
        };
      } catch {
        continue;
      }
    }
    return {
      ...base,
      name: component.name,
      ...docs,
      ...(Object.keys(subcomponents).length ? { subcomponents } : {}),
    };
  } catch (error) {
    return {
      ...base,
      error: {
        name: 'Svelte docgen failed',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function componentDocs(componentPath: string, context: BuildDocgenContext) {
  const source = await readFile(componentPath, 'utf8');
  const documentationSource = await preprocess(source, { style: () => ({ code: '' }) });
  const docgen = generateDocgen(componentPath, context.cache, {
    server: true,
    documentationSource: documentationSource.code,
  });
  return {
    ...extractComponentDescription(undefined, docgen.description, docgen.jsDocTags),
    argTypes: createServerArgTypes(docgen),
  };
}
