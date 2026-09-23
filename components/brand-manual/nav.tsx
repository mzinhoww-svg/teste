import { ReinersMark } from "./mark";

// Nav sticky do manual — símbolo + wordmark à esquerda, âncoras das 9 seções
// à direita. `overflow-x-auto` é a única adaptação a mobile em relação à
// referência (que não define breakpoint algum): evita quebra de linha sem
// mudar a altura fixa de 60px nem o espaçamento no desktop.

const NAV_LINKS = [
  { href: "#s01", label: "01 Essência" },
  { href: "#s02", label: "02 Logo" },
  { href: "#s03", label: "03 Paleta" },
  { href: "#s04", label: "04 Tipo" },
  { href: "#s05", label: "05 Ícones" },
  { href: "#s06", label: "06 Padrões" },
  { href: "#s07", label: "07 Aplicações" },
  { href: "#s08", label: "08 Specs" },
  { href: "#s09", label: "09 Manifesto" },
] as const;

export function BrandManualNav() {
  return (
    <nav
      aria-label="Seções do manual de marca"
      className="sticky top-0 z-50 flex h-[60px] items-center justify-between gap-6 border-b border-manual-ouro bg-manual-navy/[0.97] px-6 backdrop-blur-[6px] backdrop-saturate-[140%] sm:px-10"
    >
      <div className="flex shrink-0 items-center gap-3">
        <ReinersMark theme="dark" size={26} />
        <span className="font-manual-serif text-[15px] font-bold tracking-[0.18em] text-manual-creme">
          REINERS <span className="text-manual-ouro-claro">MEDIA</span>
        </span>
      </div>
      <ul className="flex min-w-0 gap-4 overflow-x-auto sm:gap-[22px]">
        {NAV_LINKS.map((l) => (
          <li key={l.href} className="shrink-0">
            <a
              href={l.href}
              className="whitespace-nowrap font-manual-mono text-[10px] uppercase tracking-[0.14em] text-manual-ouro-palido/75 transition-opacity duration-fast hover:opacity-100 focus-visible:opacity-100"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
