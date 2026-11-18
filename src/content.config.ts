import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Optional notes sidecars: gpx/<...>/<Title>.md next to <Title>.gpx. The id
// is the path relative to gpx/, so it lines up with the GPX file.
const notes = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './gpx',
    generateId: ({ entry }) => entry.normalize('NFC'),
  }),
  schema: z.object({
    date: z.coerce.date().optional(),
    partners: z.array(z.string()).optional(),
  }),
});

export const collections = { notes };
