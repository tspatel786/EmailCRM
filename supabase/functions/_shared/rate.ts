import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

export async function limit(
  admin: SupabaseClient,
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(JSON.stringify({ msg: "rate_limit_error", error: error.message }));
    return true;
  }
  return Boolean(data);
}
