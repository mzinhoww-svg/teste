// Cabeçalho de seção reutilizável: título + descrição + ações à direita.
export function Section({ title, description, action, children }: {
  title: string; description?: string; action?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
