const allowOrigin = Deno.env.get("APP_PUBLIC_URL") ?? "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": allowOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
