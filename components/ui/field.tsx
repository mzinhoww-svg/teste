import { Label } from "./input";

// Campo de formulário: label + controle + hint/erro, espaçamento consistente.
export function Field({ label, htmlFor, hint, error, children }: {
  label: string; htmlFor?: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p>
        : hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
