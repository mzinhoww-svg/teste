import { CheckSquare } from "lucide-react";
import { getOpenTasks, type TaskRow } from "@/lib/db";
import { TaskItem } from "@/components/TaskItem";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Meu dia — CRM AI Studio" };
export const dynamic = "force-dynamic";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function TarefasPage() {
  const tasks = await getOpenTasks();
  const today = todayStr();
  const atrasadas = tasks.filter((t) => (t.due_at ?? "").slice(0, 10) < today);
  const hoje = tasks.filter((t) => (t.due_at ?? "").slice(0, 10) === today);
  const proximas = tasks.filter((t) => (t.due_at ?? "").slice(0, 10) > today);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Meu dia</h1>
        <p className="text-sm text-slate-500">Suas tarefas com prazo — atrasadas, de hoje e próximas.</p>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Nenhuma tarefa pendente" description="Tarefas com prazo (próxima ação nos deals) aparecem aqui." />
      ) : (
        <div className="space-y-6">
          <Group title="Atrasadas" count={atrasadas.length} tone="danger" tasks={atrasadas} />
          <Group title="Hoje" count={hoje.length} tone="brand" tasks={hoje} />
          <Group title="Próximas" count={proximas.length} tone="muted" tasks={proximas} />
        </div>
      )}
    </main>
  );
}

function Group({ title, count, tone, tasks }: { title: string; count: number; tone: "danger" | "brand" | "muted"; tasks: TaskRow[] }) {
  if (tasks.length === 0) return null;
  const toneCls = tone === "danger" ? "text-rose-600" : tone === "brand" ? "text-brand-600 dark:text-brand-300" : "text-slate-500";
  return (
    <section>
      <h2 className={`mb-2 text-sm font-semibold ${toneCls}`}>{title} <span className="text-slate-400">· {count}</span></h2>
      <ul className="space-y-2">
        {tasks.map((t) => <TaskItem key={t.id} task={t} />)}
      </ul>
    </section>
  );
}
