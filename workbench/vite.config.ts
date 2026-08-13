/// <reference types="vitest" />
import { vitePlugin as remixVitePlugin } from '@remix-run/dev';
import { a2NodeServer } from './app/a2/node-server';
import UnoCSS from 'unocss/vite';
import { defineConfig, type ViteDevServer } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import tsconfigPaths from 'vite-tsconfig-paths';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

// Get git hash with fallback
const getGitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'no-git-info';
  }
};




export default defineConfig((config) => {
  return {
    define: {
      __COMMIT_HASH: JSON.stringify(getGitHash()),
      __APP_VERSION: JSON.stringify(process.env.npm_package_version),
      // 'process.env': JSON.stringify(process.env)
    },
    build: {
      target: 'esnext',
    },
    ssr: {
      // A2 (design D7/D8): resolve modules like the Cloudflare workerd runtime did,
      // so react-dom/server exposes renderToReadableStream under plain Node SSR.
      resolve: {
        conditions: ['workerd', 'worker', 'browser'],
        externalConditions: ['workerd', 'worker', 'node'],
      },

      // A2 (task 3.1): keep server-only CJS deps out of the SSR transform.
      // Even external, their bare 'path' imports hit the nodePolyfills alias
      // unless the alias is scoped away from SSR (see the plugin below).
      external: ['@prisma/client', 'bcryptjs'],
    },
    plugins: [
      nodePolyfills({
        include: ['path', 'buffer', 'process'],
      }),
      // A2 (task 3.1): nodePolyfills aliases bare node builtins to browser
      // polyfills, and Vite's resolver also routes 'node:*' specifiers through
      // those entries. Under Node SSR that turns e.g. db.server.ts's
      // 'node:path' import into path-browserify, which crashes on evaluation
      // ("module is not defined"). Resolve builtins natively for SSR imports.
      {
        name: 'a2-ssr-native-builtins',
        enforce: 'pre',
        resolveId(source, _importer, options) {
          if ((options as any)?.ssr && /^(node:)?(path|buffer|process)$/.test(source)) {
            return { id: source.startsWith('node:') ? source : `node:${source}`, external: true };
          }

          return null;
        },
      },
      config.mode !== 'test' && a2NodeServer(),
      remixVitePlugin({
        future: {
          v3_fetcherPersist: true,
          v3_relativeSplatPath: true,
          v3_throwAbortReason: true,
          v3_lazyRouteDiscovery: true
        },
      }),
      UnoCSS(),
      tsconfigPaths(),
      chrome129IssuePlugin(),
      config.mode === 'production' && optimizeCssModules({ apply: 'build' }),
    ],
    // Unit tests live next to sources in app/ only; keeps vitest away from
    // tests/e2e (Playwright) and locked dirs like chrome-debug-profile.
    test: {
      include: ['app/**/*.spec.ts'],
    },
    envPrefix: ["VITE_","OPENAI_LIKE_API_BASE_URL", "OLLAMA_API_BASE_URL", "LMSTUDIO_API_BASE_URL","TOGETHER_API_BASE_URL", "A2_ENABLE_RESPONSE_STATS", "A2_ENABLE_GENERATION_TELEMETRY", "A2_ENABLE_MULTI_AGENT_MODE"],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
  };
});

function chrome129IssuePlugin() {
  return {
    name: 'chrome129IssuePlugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const raw = req.headers['user-agent']?.match(/Chrom(e|ium)\/([0-9]+)\./);

        if (raw) {
          const version = parseInt(raw[2], 10);

          if (version === 129) {
            res.setHeader('content-type', 'text/html');
            res.end(
              '<body><h1>Please use Chrome Canary for testing.</h1><p>Chrome 129 has an issue with JavaScript modules & Vite local development, see <a href="https://github.com/stackblitz/bolt.new/issues/86#issuecomment-2395519258">for more information.</a></p><p><b>Note:</b> This only impacts <u>local development</u>. `pnpm run build` and `pnpm run start` will work fine in this browser.</p></body>',
            );

            return;
          }
        }

        next();
      });
    },
  };
}
