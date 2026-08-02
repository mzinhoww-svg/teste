"use client";

import { useFormStatus } from "react-dom";

// Primitivas de formulário do admin, sob os tokens do PodFactory.
// Todos os campos cobrem os estados default / hover / focus-visible / disabled
// e usam surface.strong como fundo (spec §2).

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-pf-xs uppercase tracking-pf-meta text-pf-primary/50">{label}</span>
      {children}
      {hint ? <span className="text-pf-sm text-pf-primary/50">{hint}</span> : null}
    </label>
  );
}

const CONTROL =
  "min-h-[44px] w-full rounded-pf-md border border-pf-muted/[0.08] bg-pf-strong px-3 py-2 text-pf-base text-pf-primary transition-colors duration-pf-fast ease-pf hover:border-pf-muted/[0.15] disabled:cursor-not-allowed disabled:opacity-[0.35]";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Button({
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary:
      "bg-pf-inverse text-pf-base hover:shadow-pf-3 active:scale-[0.98] active:duration-pf-instant",
    ghost:
      "border border-pf-muted/[0.15] text-pf-primary hover:border-pf-inverse hover:text-pf-inverse",
    danger: "border border-pf-danger text-pf-danger hover:bg-pf-danger/10",
  }[variant];

  return (
    <button
      {...props}
      className={`pf-motion-transform inline-flex min-h-[44px] items-center justify-center rounded-pf-md px-4 text-pf-xl font-medium transition-[box-shadow,transform,background-color,border-color,color] duration-pf-fast ease-pf disabled:cursor-not-allowed disabled:opacity-[0.35] ${styles} ${props.className ?? ""}`}
    />
  );
}

/** Botão de submit que se desabilita durante o envio da Server Action. */
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : children}
    </Button>
  );
}

export function Alert({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={`rounded-pf-md border px-3 py-2 text-pf-sm ${
        kind === "error"
          ? "border-pf-danger text-pf-danger"
          : "border-pf-inverse/25 bg-pf-inverse/[0.12] text-pf-inverse"
      }`}
    >
      {children}
    </p>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-pf-lg border border-pf-muted/[0.06] bg-pf-raised p-5 shadow-pf-1 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-pf-panel font-medium text-pf-primary">{title}</h1>
      {action}
    </div>
  );
}
