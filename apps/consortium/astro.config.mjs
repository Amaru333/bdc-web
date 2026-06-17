import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = join(rootDir, '../..');
Object.assign(process.env, loadEnv('', monorepoRoot, ''));
const uswdsPackages = join(rootDir, '../../node_modules/@uswds/uswds/packages');

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [mdx(), react()],
  vite: {
    envDir: monorepoRoot,
    optimizeDeps: {
      include: ['react', 'react-dom', '@trussworks/react-uswds'],
    },
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: [uswdsPackages],
          silenceDeprecations: ['import', 'global-builtin', 'if-function'],
          quietDeps: true,
        },
      },
    },
  },
});
