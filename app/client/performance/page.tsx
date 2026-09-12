// app/client/performance/page.tsx
import { getCurrentRole } from "@/lib/role";
import { redirect } from "next/navigation";
import { ClientPerformancePage } from "@/components/client/ClientPerformancePage";

export default async function Page() {
  const { role, client } = await getCurrentRole() as any;
  if (role !== "client" || !client) redirect("/");
  return <ClientPerformancePage />;
}
