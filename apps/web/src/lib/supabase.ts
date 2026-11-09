import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.warn("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. The UI will not load data until they are configured.");
}

export const supabase = createClient(url || "http://127.0.0.1:54321", anon || "public-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let detailedMsg = error.message;
    if ("context" in error && error.context) {
      try {
        const errJson = await (error.context as Response).json();
        if (errJson?.error) detailedMsg = errJson.error;
        if (errJson?.detail) detailedMsg += `: ${errJson.detail}`;
      } catch {
        // Response body wasn't JSON
      }
    }
    console.error(`[EdgeFunction:${name}] invocation failed:`, detailedMsg, error);
    throw new Error(detailedMsg || `Edge function ${name} failed`);
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}
