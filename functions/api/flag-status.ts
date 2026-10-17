import { getFlagStatusPayload } from '../../server/flagStatusCore';

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  try {
    const url = new URL(context.request.url);
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
