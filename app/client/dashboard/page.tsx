// app/client/dashboard/page.tsx
export const dynamic = "force-dynamic";

import { getCurrentRole } from "@/lib/role";
import { redirect } from "next/navigation";
import { ClientDashboard } from "@/components/client/ClientDashboard";

export default async function DashboardPage() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) redirect("/");

  return <ClientDashboard clientName={client.name} />;
}
