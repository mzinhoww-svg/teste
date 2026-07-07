import { MessageCircle, Mail } from "lucide-react";
import { getAuthContext, getWaOverrides, getEmailSignature } from "@/lib/db";
import { saveWaTemplate, saveEmailSignature } from "@/app/actions";
import { WA_TEMPLATES, type WaTemplateKey } from "@/lib/whatsapp";
import { TemplateEditor } from "@/components/TemplateEditor";
import { PermissionDenied } from "@/components/PermissionDenied";

export const metadata = { title: "Templates — CRM AI Studio" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const ctx = await getAuthContext();
  if (!ctx?.orgId) return null;
  if (ctx.role === "member") return <PermissionDenied orgName={ctx.orgName} role={ctx.role} />;

  const [overrides, signature] = await Promise.all([getWaOverrides(), getEmailSignature()]);
  const keys = Object.keys(WA_TEMPLATES) as WaTemplateKey[];

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Templates</h1>
        <p className="text-sm text-slate-500">Edite as mensagens de WhatsApp e a assinatura dos e-mails. Deixe em branco para usar o padrão.</p>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <Mail className="h-4 w-4 text-slate-400" aria-hidden /> Assinatura de e-mail
        </h2>
        <TemplateEditor
          label="Assinatura (rodapé de todos os e-mails)"
          hint="Texto simples; aparece no rodapé de convites, propostas, faturas etc. Deixe vazio para não exibir."
          placeholder="Ex.: Reiners Media · Presença que posiciona · contato@reiners.agency"
          initialValue={signature}
          action={saveEmailSignature}
        />
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          <MessageCircle className="h-4 w-4 text-slate-400" aria-hidden /> Mensagens de WhatsApp
        </h2>
        <p className="mb-3 text-[11px] text-slate-400">Placeholders disponíveis: <code>{"{nome}"}</code> <code>{"{empresa}"}</code> <code>{"{link}"}</code>. Vazio = usa o texto padrão do CRM.</p>
        <div className="space-y-3">
          {keys.map((k) => (
            <TemplateEditor
              key={k}
              label={WA_TEMPLATES[k].label}
              placeholder={WA_TEMPLATES[k].build({ nome: "{nome}", empresa: "{empresa}", link: "{link}" })}
              initialValue={overrides[k] ?? ""}
              action={saveWaTemplate.bind(null, k)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
