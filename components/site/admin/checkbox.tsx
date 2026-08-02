// Checkbox do CMS. Alvo de toque 44px e foco herdado do token do site.
export function SiteCheckbox({
  id, name, label, defaultChecked,
}: {
  id: string;
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-5 w-5 shrink-0 accent-site-text-inverse"
      />
      <span className="text-site-base text-site-text-primary/80">{label}</span>
    </label>
  );
}
