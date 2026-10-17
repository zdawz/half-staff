import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getFlagStatusPayload } from './flagStatusCore';

export * from './flagStatusCore';

export function flagApiPlugin(): Plugin {
  const attachMiddleware = (middlewares: {
    use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;
  }) => {
    middlewares.use(async (req, res, next) => {
      if (!req.url || !req.url.startsWith('/api/flag-status')) {
        next();
        return;
      }
      try {
        const url = new URL(req.url, 'http://localhost');
        const forceRefresh = url.searchParams.get('refresh') === '1';
        const payload = await getFlagStatusPayload(forceRefresh);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(payload));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Internal Server Error',
          })
        );
      }
    });
  };

  return {
    name: 'flag-api-middleware',
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}
