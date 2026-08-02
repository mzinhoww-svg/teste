/**
 * "Podcast In Loco 2024!" → "podcast-in-loco-2024".
 * Remove acentos, colapsa separadores e limita o tamanho. Puro — vive fora do
 * módulo de Server Actions porque lá todo export precisa ser async.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // marcas de acentuação combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
