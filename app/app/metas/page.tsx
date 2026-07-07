import { getGoals, getOrgMembers } from "@/lib/db";
import { GoalsManager } from "@/components/mgmt/GoalsManager";

export const metadata = { title: "Metas — CRM AI Studio" };
export const dynamic = "force-dynamic";

export default async function MetasPage() {
  const [goals, members] = await Promise.all([getGoals(), getOrgMembers()]);
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Metas</h1>
        <p className="text-sm text-slate-500">Defina metas por mês, métrica e vendedor. Alimentam o forecast e o Pipeline review.</p>
      </div>
      <GoalsManager goals={goals} members={members} />
    </main>
  );
}
