import { getFlagStatusPayload } from './flagStatusCore';

export interface Env {
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/flag-status')) {
      try {
        const forceRefresh = url.searchParams.get('refresh') === '1';
        const payload = await getFlagStatusPayload(forceRefresh);

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': forceRefresh
              ? 'no-store'
              : 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
          },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Internal Server Error',
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
          }
        );
      }
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
