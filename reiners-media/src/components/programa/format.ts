/**
 * TCK-016 — Formatação de data e duração da página de programa.
 *
 * Duas regras que este módulo carrega, e que são fáceis de errar em componente:
 *
 * 1. **Fuso fixo em UTC.** `publishedAt` chega como ISO-8601 com offset
 *    (`isoDateTimeSchema`). Sem `timeZone: 'UTC'` o `Intl` usa o fuso do
 *    ambiente: o Server Component renderiza no fuso do servidor (Vercel = UTC)
 *    e a hidratação/teste no fuso da máquina. Um episódio publicado às
 *    `2025-03-10T02:00:00Z` viraria "09 de março" no Brasil e "10 de março" no
 *    servidor — divergência de texto entre SSR e cliente, que o React reporta
 *    como erro de hidratação. Fixar UTC torna a saída determinística.
 *
 * 2. **`<time dateTime>` legível por máquina.** O texto exibido é para gente;
 *    o atributo é para agente de usuário e SEO. A duração `"45:30"` vira
 *    `"PT45M30S"` (ISO-8601), formato que o `<time>` aceita e que o
 *    schema.org/PodcastEpisode espera.
 *
 * Módulo puro: sem React, sem acesso a `Date.now()`.
 */

/** Locale do produto — o site é pt-BR (ver `<html lang>` do root layout). */
export const LOCALE = 'pt-BR';

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * `'2025-03-10T02:00:00.000Z'` → `'10 de março de 2025'`.
 * Entrada inválida devolve `null` (nunca `Invalid Date` na tela).
 */
export function formatPublishedAt(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormatter.format(date);
}

/** `'2025-03-10T02:00:00.000Z'` → `'2025-03-10'`, para o `dateTime` do `<time>`. */
export function toDateTimeAttribute(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * `'45:30'` → `'PT45M30S'`; `'01:12:05'` → `'PT1H12M5S'`.
 *
 * Aceita exatamente o que `durationSchema` aceita (`MM:SS` ou `HH:MM:SS`);
 * qualquer outra coisa devolve `null` e o consumidor simplesmente omite o
 * atributo — `<time dateTime="45:30">` seria inválido em HTML.
 */
export function toIsoDuration(duration: string | null | undefined): string | null {
  if (typeof duration !== 'string') return null;

  const parts = duration.trim().split(':');
  if (parts.length < 2 || parts.length > 3) return null;

  const numbers = parts.map((part) => (/^\d{1,2}$/.test(part) ? Number(part) : Number.NaN));
  if (numbers.some((value) => Number.isNaN(value))) return null;

  const [hours, minutes, seconds] =
    numbers.length === 3
      ? (numbers as [number, number, number])
      : ([0, numbers[0], numbers[1]] as [number, number, number]);

  if (minutes > 59 || seconds > 59) return null;

  const segments = [
    hours > 0 ? `${hours}H` : '',
    minutes > 0 ? `${minutes}M` : '',
    seconds > 0 ? `${seconds}S` : '',
  ].join('');

  return segments.length > 0 ? `PT${segments}` : 'PT0S';
}

/**
 * `'45:30'` → `'45 min 30 s'`. O texto visível continua sendo `45:30`; esta
 * versão vai para o rótulo acessível, porque um leitor de tela lê `"45:30"`
 * como "quarenta e cinco dois pontos trinta".
 */
export function toSpokenDuration(duration: string | null | undefined): string | null {
  const iso = toIsoDuration(duration);
  if (iso === null) return null;

  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;

  const [, hours, minutes, seconds] = match;
  const spoken = [
    hours ? `${hours} h` : '',
    minutes ? `${minutes} min` : '',
    seconds ? `${seconds} s` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return spoken.length > 0 ? spoken : '0 s';
}

/** `1` → `'Episódio 1'`. Centralizado para o rótulo acessível e o visual não divergirem. */
export function formatEpisodeNumber(value: number): string {
  return `Episódio ${value}`;
}

/**
 * Pluralização do contador de episódios. `Intl.PluralRules` seria exagero para
 * duas formas em pt-BR, e um `s` concatenado erraria em "0 episódio".
 */
export function formatEpisodeCount(count: number): string {
  return count === 1 ? '1 episódio' : `${count} episódios`;
}
