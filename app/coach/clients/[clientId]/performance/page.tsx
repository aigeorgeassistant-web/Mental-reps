import { getCurrentRole } from "@/lib/role";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { PerformancePage } from "@/components/coach/PerformancePage";

export default async function PerformancePageRoute({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { role, coach } = await getCurrentRole() as any;
  if (role !== "coach" || !coach) redirect("/");

  const client = await db.client.findFirst({
    where: { id: clientId, coachId: coach.id },
  });
  if (!client) notFound();

  return <PerformancePage clientId={clientId} clientName={client.name} />;
}
