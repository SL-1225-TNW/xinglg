import { build } from 'esbuild';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({ stdin: { contents: "export { createClient } from '@supabase/supabase-js';", resolveDir: root+'tests' },
  bundle: true, outfile: root+'vendor/supabase.js', format: 'iife', globalName: 'MossSupabase',
  platform: 'browser', target: ['es2020'], minify: true, legalComments: 'eof' });
// Upstream npm package declares MIT; retain the upstream license alongside the bundle.
console.log('Bundled pinned Supabase SDK locally (no runtime CDN).');
