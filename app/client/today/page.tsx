// app/client/today/page.tsx
// Finds today's session and redirects to /client/session/[id].
// force-dynamic: same reasoning as session/[sessionId]/page.tsx.

export const dynamic = "force-dynamic";

import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function TodayPage() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) redirect("/");

  const now = new Date();
  const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 12 * 60 * 60 * 1000);

  const sessions = await db.session.findMany({
    where: {
      program: { clientId: client.id, isTemplate: false },
      date: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, date: true },
  });

  let best: { id: string; date: Date } | null = null;
  for (const s of sessions) {
    if (!s.date) continue;
    if (!best || Math.abs(s.date.getTime() - now.getTime()) < Math.abs(best.date.getTime() - now.getTime())) {
      best = s as { id: string; date: Date };
    }
  }

  if (best) redirect(`/client/session/${best.id}`);

  return (
    <>
      <style>{`
        :root{--bg:#14161a;--panel:#1c1f24;--line:#2a2e35;--text:#edeae4;--dim:#8a8f98;--steel:#5c7a8a;}
        body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
      `}</style>
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🗓</div>
        <p style={{ color: "var(--dim)", fontSize: 15 }}>No session scheduled for today.</p>
        <a href="/client/dashboard" style={{ display: "inline-block", marginTop: 20, color: "var(--steel)", fontSize: 13 }}>View your program →</a>
      </div>
    </>
  );
}
