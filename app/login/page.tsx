import { login, signup } from "./actions";

export const metadata = { title: "Entrar — CRM AI Studio" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white">AI</div>
          <h1 className="text-lg font-semibold text-slate-900">CRM AI Studio</h1>
          <p className="text-sm text-slate-500">Entre ou crie sua conta para começar.</p>
        </div>

        {searchParams.error && (
          <div className="animate-shake mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{searchParams.error}</div>
        )}
        {searchParams.message && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{searchParams.message}</div>
        )}

        <form className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">E-mail</label>
            <input name="email" type="email" required autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400" placeholder="voce@empresa.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Senha</label>
            <input name="password" type="password" required minLength={6} autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-400" placeholder="mínimo 6 caracteres" />
          </div>
          <div className="flex gap-2 pt-1">
            <button formAction={login}
              className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">Entrar</button>
            <button formAction={signup}
              className="flex-1 rounded-lg border border-brand-300 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">Criar conta</button>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Ao criar a conta, seu funil e os 9 agentes já vêm configurados automaticamente.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs">
          <a href="/" className="text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline">← Página inicial</a>
          <span className="text-slate-300">·</span>
          <a href="/admin" className="text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline">Sou admin da plataforma</a>
        </div>
        <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
          Seus dados ficam isolados por organização e são tratados conforme a LGPD (Lei 13.709/2018).
          Você pode exportá-los a qualquer momento em Relatórios → Exportar dados.
        </p>
      </div>
    </div>
  );
}
