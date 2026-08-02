import * as React from "react";
import { cn } from "@/lib/utils";

// Input / Textarea do site público.
// Anatomia: label → controle → helper (ou erro). Estados: default, hover,
// focus, focus-visible, error, disabled. Placeholder é INSTRUTIVO (nunca
// repete o label) — regra de conteúdo do design system.

const controlBase = [
  "w-full rounded-site-md border bg-site-surface-strong px-4 py-3",
  "font-borna text-site-base text-site-text-primary",
  "placeholder:text-site-text-primary/45",
  "transition-all duration-fast",
  "hover:border-site-border-muted/20",
  "focus:border-site-text-inverse focus:shadow-site-3",
  "disabled:cursor-not-allowed disabled:border-site-border-muted/[0.05] disabled:bg-site-border-muted/[0.03] disabled:text-site-text-primary/30",
].join(" ");

type FieldShellProps = {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  children: React.ReactNode;
};

function FieldShell({ id, label, helper, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-site-sm font-medium text-site-text-primary/70">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="flex items-center gap-s7 text-site-xs normal-case tracking-normal text-site-danger">
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5 15 14H1L8 1.5Zm0 4.5v4m0 2.2v.1" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-msg`} className="text-site-xs normal-case tracking-normal text-site-text-primary/55">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export type SiteInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  helper?: string;
  error?: string;
};

export const SiteInput = React.forwardRef<HTMLInputElement, SiteInputProps>(
  ({ id, label, helper, error, className, ...props }, ref) => (
    <FieldShell id={id} label={label} helper={helper} error={error}>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helper ? `${id}-msg` : undefined}
        className={cn(
          controlBase,
          error ? "border-site-danger" : "border-site-border-muted/10",
          className,
        )}
        {...props}
      />
    </FieldShell>
  ),
);
SiteInput.displayName = "SiteInput";

export type SiteTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  helper?: string;
  error?: string;
};

export const SiteTextarea = React.forwardRef<HTMLTextAreaElement, SiteTextareaProps>(
  ({ id, label, helper, error, className, ...props }, ref) => (
    <FieldShell id={id} label={label} helper={helper} error={error}>
      <textarea
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helper ? `${id}-msg` : undefined}
        className={cn(
          controlBase,
          "max-h-[400px] min-h-[100px] resize-y",
          error ? "border-site-danger" : "border-site-border-muted/10",
          className,
        )}
        {...props}
      />
    </FieldShell>
  ),
);
SiteTextarea.displayName = "SiteTextarea";
