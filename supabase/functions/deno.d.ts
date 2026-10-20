// Ambient declarations for Deno runtime and Supabase Edge Functions in the IDE
declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
  }
  export const env: Env;
  export function serve(
    handler: (req: Request) => Promise<Response> | Response,
    options?: { port?: number; hostname?: string }
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2.47.10" {
  export * from "@supabase/supabase-js";
}

declare module "https://esm.sh/*" {
  const content: any;
  export default content;
  export * from "any";
}
