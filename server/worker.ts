import { getFlagStatusPayload, resolveUserLocation } from './flagStatusCore';

export interface Env {
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

interface CfProperties {
  country?: string;
  regionCode?: string;
  region?: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.bigdatacloud.net; font-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/locate')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return withSecurityHeaders(
          new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: {
              Allow: 'GET, HEAD',
              'Content-Type': 'application/json; charset=utf-8',
            },
          })
        );
      }

      const latParam = url.searchParams.get('lat');
      const lonParam = url.searchParams.get('lon');
      const lat = latParam !== null ? Number.parseFloat(latParam) : null;
      const lon = lonParam !== null ? Number.parseFloat(lonParam) : null;

      const cf = (request as Request & { cf?: CfProperties }).cf;
      const cfRegionCode = cf?.regionCode || request.headers.get('cf-region-code');
      const cfCountry = cf?.country || request.headers.get('cf-ipcountry');

      const result = await resolveUserLocation({
        lat,
        lon,
        cfRegionCode,
        cfCountry,
      });

      return withSecurityHeaders(
        new Response(request.method === 'HEAD' ? null : JSON.stringify(result), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        })
      );
    }

    if (url.pathname.startsWith('/api/flag-status')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return withSecurityHeaders(
          new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: {
              Allow: 'GET, HEAD',
              'Content-Type': 'application/json; charset=utf-8',
            },
          })
        );
      }

      try {
        const forceRefresh = url.searchParams.get('refresh') === '1';
        const payload = await getFlagStatusPayload(forceRefresh);

        return withSecurityHeaders(
          new Response(request.method === 'HEAD' ? null : JSON.stringify(payload), {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': forceRefresh
                ? 'no-store'
                : 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
            },
          })
        );
      } catch {
        return withSecurityHeaders(
          new Response(
            JSON.stringify({
              error: 'Internal Server Error',
            }),
            {
              status: 500,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
              },
            }
          )
        );
      }
    }

    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      const secured = withSecurityHeaders(assetResponse);
      if (url.pathname === '/sw.js' || url.pathname === '/' || url.pathname === '/index.html') {
        const headers = new Headers(secured.headers);
        headers.set('Cache-Control', 'no-cache');
        return new Response(secured.body, {
          status: secured.status,
          statusText: secured.statusText,
          headers,
        });
      }
      return secured;
    }

    return withSecurityHeaders(new Response('Not Found', { status: 404 }));
  },
};
