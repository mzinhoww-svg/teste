import { getInbox } from "@/lib/db";
import { InboxList } from "@/components/inbox/InboxList";
import { CsvImport } from "@/components/inbox/CsvImport";

export const metadata = { title: "Caixa de entrada — CRM AI Studio" };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const items = await getInbox();
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Caixa de entrada</h1>
          <p className="text-sm text-slate-500">Leads que chegaram por formulário, WhatsApp ou API — converta em card ou descarte.</p>
        </div>
        <CsvImport />
      </div>
      <InboxList items={items} />
    </main>
  );
}
