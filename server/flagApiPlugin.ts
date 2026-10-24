import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getFlagStatusPayload, resolveUserLocation } from './flagStatusCore';

export * from './flagStatusCore';

export function flagApiPlugin(): Plugin {
  const attachMiddleware = (middlewares: {
    use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void;
  }) => {
    middlewares.use(async (req, res, next) => {
      const pathname = req.url ? new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '') : '';
      if (pathname !== '/api/flag-status' && pathname !== '/api/locate') {
        next();
        return;
      }

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
      }

      try {
        const url = new URL(req.url || '/', 'http://localhost');

        if (pathname === '/api/locate') {
          const latParam = url.searchParams.get('lat');
          const lonParam = url.searchParams.get('lon');
          const lat = latParam !== null ? Number.parseFloat(latParam) : null;
          const lon = lonParam !== null ? Number.parseFloat(lonParam) : null;

          // The dev server runs on the visitor's own network, so a server-side IP lookup is meaningful here
          const result = await resolveUserLocation({ lat, lon, allowServerIpLookup: true });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(req.method === 'HEAD' ? undefined : JSON.stringify(result));
          return;
        }

        const forceRefresh =
          url.searchParams.get('refresh') === '1' || url.searchParams.get('fresh') === '1';
        const payload = await getFlagStatusPayload(forceRefresh);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(payload));
      } catch {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify({
            error: 'Internal Server Error',
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
