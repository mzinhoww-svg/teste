"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// Alternador claro/escuro/sistema. Persiste em localStorage; o script no
// layout aplica a escolha antes da hidratação (sem flash).
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme | null) ?? "system";
    setTheme(stored);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if ((localStorage.getItem("theme") ?? "system") === "system") apply("system"); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    if (next === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", next);
    apply(next);
  }

  const opts: { key: Theme; label: string; icon: typeof Sun }[] = [
    { key: "light", label: "Claro", icon: Sun },
    { key: "dark", label: "Escuro", icon: Moon },
    { key: "system", label: "Sistema", icon: Monitor },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800"
    >
      {opts.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={theme === key}
          aria-label={label}
          title={label}
          onClick={() => choose(key)}
          className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
            theme === key
              ? "bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-300"
              : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
