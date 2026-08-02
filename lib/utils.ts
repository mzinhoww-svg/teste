import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// A escala tipográfica do site (`text-site-base`, `text-site-4xl`…) tem o mesmo
// prefixo dos tokens de cor (`text-site-text-primary`). Sem ensinar isso ao
// tailwind-merge, ele trata as duas como o mesmo grupo e a última vence — a cor
// some quando um componente recebe `className="text-site-sm"`. Registramos os
// tamanhos explicitamente; todo o resto de `text-*` continua sendo cor.
const SITE_FONT_SIZES = [
  "site-xs", "site-sm", "site-md", "site-lg", "site-xl",
  "site-2xl", "site-3xl", "site-4xl", "site-base",
  "site-display", "site-h2", "site-h2-lg",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: SITE_FONT_SIZES }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
