// Standalone version of supabase/functions/food-search/index.ts — same
// logic, but run as a plain always-on Deno process instead of an Edge
// Function. This exists because FatSecret's OAuth2 credentials are
// IP-restricted (up to 15 allowed IPs per their dashboard), and serverless
// edge platforms (Supabase Edge Functions, Cloudflare Workers, etc.) don't
// have a fixed egress IP — see the project's Eat Plenty search conversation
// for the full trail. A real VM with a static IP is the only thing that
// actually satisfies FatSecret's requirement.
//
// Run with: deno run --allow-net --allow-env main.ts
// Required env vars: FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET,
// FOOD_SEARCH_SHARED_SECRET, PORT (defaults to 8787)

const FATSECRET_CLIENT_ID = Deno.env.get('FATSECRET_CLIENT_ID') ?? '';
const FATSECRET_CLIENT_SECRET = Deno.env.get('FATSECRET_CLIENT_SECRET') ?? '';
const SHARED_SECRET = Deno.env.get('FOOD_SEARCH_SHARED_SECRET') ?? '';
const PORT = parseInt(Deno.env.get('PORT') ?? '8787', 10);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-app-secret',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const basicAuth = btoa(`${FATSECRET_CLIENT_ID}:${FATSECRET_CLIENT_SECRET}`);
  const res = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=basic',
  });
  if (!res.ok) {
    throw new Error(`FatSecret token request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (SHARED_SECRET && req.headers.get('x-app-secret') !== SHARED_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    const foodId = url.searchParams.get('food_id');
    if (!query && !foodId) {
      return new Response(JSON.stringify({ error: 'Missing q or food_id parameter' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const token = await getAccessToken();
    // food_id lookups fetch full per-serving detail (including the metric
    // gram/ml equivalent for household servings like "1 stick") — used by
    // the app to convert a label serving to grams, which the plain search
    // endpoint's free-text description can't provide.
    const detailUrl = foodId
      ? `https://platform.fatsecret.com/rest/food/v4?food_id=${encodeURIComponent(foodId)}&format=json`
      : `https://platform.fatsecret.com/rest/foods/search/v1?search_expression=${encodeURIComponent(query)}&max_results=50&format=json`;
    const upstreamRes = await fetch(detailUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await upstreamRes.json();

    return new Response(JSON.stringify(data), {
      status: upstreamRes.ok ? 200 : upstreamRes.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

console.log(`food-search proxy listening on :${PORT}`);
