import { createRequestHandler } from '@remix-run/node';
import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { Plugin } from 'vite';

// A2 (design D7/D8): run Remix server routes in the Node process instead of the
// Cloudflare dev proxy (workerd, which crashes and cannot host Prisma/SQLite).
// Provides context.cloudflare.env from .env/.dev.vars so server-side code
// (LLM gateway, later Prisma persistence) runs on Node with real env access.
export function a2NodeServer(): Plugin {
  dotenv.config();

  if (existsSync('.dev.vars')) {
    dotenv.config({ path: '.dev.vars', override: true });
  }

  const env: Record<string, string | undefined> = { ...process.env };

  return {
    name: 'a2-node-server',
    configureServer(server) {
      // register after vite's internal middlewares so assets/HMR are served by vite
      return () => {
        const handler = createRequestHandler(
          () => server.ssrLoadModule('virtual:remix/server-build') as Promise<any>,
          process.env.NODE_ENV || 'development',
        );

        server.middlewares.use(async (req, res, next) => {
          try {
            const request = toWebRequest(req, res);

            if (!request) {
              return next();
            }

            const loadContext = {
              cloudflare: {
                env,
                cf: {},
                ctx: {
                  waitUntil: () => {},
                },
                caches: undefined,
              },
            };

            const response = await handler(request, loadContext as any);

            await sendWebResponse(response, res);
          } catch (error) {
            next(error);
          }
        });
      };
    },
  };
}

function toWebRequest(req: any, res: any): Request | undefined {
  const method = (req.method || 'GET').toUpperCase();

  // let vite handle its own internal endpoints; everything else goes to Remix
  const url = new URL(req.originalUrl || req.url, `http://${req.headers.host || 'localhost'}`);

  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/__vite') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@fs/')
  ) {
    return undefined;
  }

  const controller = new AbortController();

  // A2: abort only when the client connection goes away before the response
  // finishes. NOTE: do NOT listen on req 'close' -- for a POST it fires as soon
  // as the request body is consumed, which aborts streaming LLM calls mid-flight.
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
  }

  const init: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (!['GET', 'HEAD'].includes(method)) {
    init.body = Readable.toWeb(req) as ReadableStream;
    (init as any).duplex = 'half';
  }

  return new Request(url.href, init);
}

async function sendWebResponse(response: Response, res: any): Promise<void> {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (response.body) {
    await new Promise<void>((resolve, reject) => {
      Readable.fromWeb(response.body as any)
        .pipe(res)
        .on('finish', resolve)
        .on('error', reject);
    });
  } else {
    res.end();
  }
}
