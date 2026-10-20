import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, PageHeader, Spinner } from "../components/ui";

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
    <div className="mx-auto max-w-lg p-8">
      <div className="mb-4 text-center">
        <img src="/logo.png" alt="S.M.PATEL IT HUB" className="h-12 w-auto mx-auto object-contain mb-2" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/favicon.png"; }} />
        <h2 className="text-xl font-bold tracking-tight text-slate-900 font-['Space_Grotesk']">S.M.PATEL IT HUB</h2>
      </div>
      <PageHeader title="Email preferences" />
      <Card>{msg ? <p>{msg}</p> : <Spinner />}</Card>
    </div>
  );
}
