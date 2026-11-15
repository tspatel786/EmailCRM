import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Spinner } from "../components/ui";
import { MailX } from "lucide-react";

export function UnsubscribePage() {
  const { token } = useParams();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unsubscribe?token=${token}`;
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((j) => setMsg(j.message || j.error || "Done"))
      .catch(() => setMsg("Could not process unsubscribe"));
  }, [token]);

  return (
    <div className="relative flex min-h-screen items-start justify-center bg-ink-50 px-4 py-10 sm:items-center">
      <div className="absolute inset-x-0 top-0 h-48 bg-ink-950" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.18),transparent_55%)]" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/logo.png"
            alt="S.M.PATEL IT HUB"
            className="mb-3 h-14 w-14 rounded-2xl bg-white object-contain p-1.5 shadow-md"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/favicon.png";
            }}
          />
          <h2 className="font-display text-lg font-bold tracking-tight text-white">S.M.PATEL IT HUB</h2>
        </div>
        <Card className="p-6 shadow-pop sm:p-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-600 ring-1 ring-primary-100">
              <MailX size={18} />
            </span>
            <h1 className="font-display text-xl font-bold text-ink-900">Email preferences</h1>
          </div>
          {msg ? <p className="text-sm leading-relaxed text-ink-700">{msg}</p> : <Spinner label="Processing your request..." />}
        </Card>
      </div>
    </div>
  );
}
