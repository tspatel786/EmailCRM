import { createServer } from "node:http";
import { env } from "./env.js";
import { admin } from "./db.js";

export type HealthState = {
  startedAt: string;
  lastLoopAt: string | null;
  jobsClaimed: number;
  jobsSent: number;
  jobsFailed: number;
};

export function startHealthServer(state: HealthState): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    const url = req.url?.split("?")[0];
    if (url === "/health" || url === "/healthz" || url === "/") {
      let heartbeatAt: string | null = null;
      try {
        const { data } = await admin
          .from("worker_heartbeats")
          .select("last_seen_at")
          .eq("worker_id", env.workerId)
          .maybeSingle();
        heartbeatAt = data?.last_seen_at ?? null;
      } catch {
        // Keep /healthz responsive even if Supabase is unreachable
      }
      const body = {
        ok: true,
        workerId: env.workerId,
        smtpMock: env.smtpMock,
        heartbeat: heartbeatAt,
        ...state,
      };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(env.healthPort, "0.0.0.0", () => {
    console.info(`[health] listening on 0.0.0.0:${env.healthPort}`);
  });
  return server;
}
