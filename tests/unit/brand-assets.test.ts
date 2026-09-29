import { describe, it, expect } from "vitest";
import { readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config as middlewareConfig } from "../../middleware";

// Guardas da identidade visual: o símbolo é arquivo oficial e NUNCA pode ser
// recolorido, redesenhado ou passar do limite de peso sem alguém perceber.

const PUBLIC = join(__dirname, "../../public");
const read = (rel: string) => readFileSync(join(PUBLIC, rel), "utf8");

const PALETTE = ["#14243E", "#9A7B35", "#C4A15A", "#FAF7F2", "#E8D9B5"];
const SYMBOLS = ["creme", "navy", "mono"] as const;

function pngSize(rel: string): { width: number; height: number } {
  const buf = readFileSync(join(PUBLIC, rel));
  // assinatura PNG (8 bytes) + chunk IHDR: largura/altura em big-endian.
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(rel: string): { width: number; height: number } {
  const buf = readFileSync(join(PUBLIC, rel));
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0..SOF15 (exceto DHT/JPG/DAC) carregam as dimensões.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("SOF não encontrado");
}

describe("símbolo oficial (/public/brand)", () => {
  it.each(SYMBOLS)("reinersmedia_symbol_%s.svg pesa menos de 5 KB", (tone) => {
    const bytes = statSync(join(PUBLIC, `brand/reinersmedia_symbol_${tone}.svg`)).size;
    expect(bytes).toBeLessThan(5 * 1024);
  });

  it.each(SYMBOLS)("%s usa o viewBox oficial e só cores da paleta", (tone) => {
    const svg = read(`brand/reinersmedia_symbol_${tone}.svg`);
    expect(svg).toContain('viewBox="276 226 700 628"');
    const colors = (svg.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toUpperCase());
    // #FFF/#000 (máscara) são 3 dígitos e por isso ficam fora do regex acima.
    for (const c of colors) expect(PALETTE).toContain(c);
  });

  it("navy e mono derivam do creme trocando SÓ as três cores — a geometria é idêntica", () => {
    const creme = read("brand/reinersmedia_symbol_creme.svg");
    const navy = creme
      .replace('fill="#FAF7F2" mask', 'fill="#14243E" mask')
      .replace('stroke="#C4A15A" stroke-width="16"', 'stroke="#14243E" stroke-width="16"')
      .replace('<circle cx="904" cy="786" r="44" fill="#C4A15A"/>', '<circle cx="904" cy="786" r="44" fill="#9A7B35"/>');
    const mono = navy.replace('r="44" fill="#9A7B35"', 'r="44" fill="#14243E"');
    expect(read("brand/reinersmedia_symbol_navy.svg")).toBe(navy);
    expect(read("brand/reinersmedia_symbol_mono.svg")).toBe(mono);
  });

  it("creme leva ouro claro na grade e no ponto; navy leva ouro só no ponto", () => {
    expect(read("brand/reinersmedia_symbol_creme.svg")).toContain('fill="#FAF7F2"');
    expect(read("brand/reinersmedia_symbol_navy.svg")).toContain('fill="#9A7B35"');
    expect(read("brand/reinersmedia_symbol_navy.svg")).not.toContain("#C4A15A");
    expect(read("brand/reinersmedia_symbol_mono.svg")).not.toMatch(/#9A7B35|#C4A15A|#FAF7F2/);
  });
});

describe("favicon, ícones e manifest", () => {
  it("favicon.svg: quadrado navy, símbolo creme, menos de 5 KB", () => {
    const svg = read("favicon.svg");
    expect(statSync(join(PUBLIC, "favicon.svg")).size).toBeLessThan(5 * 1024);
    expect(svg).toContain('fill="#14243E"');
    expect(svg).toContain('viewBox="276 226 700 628"');
  });

  it("apple-touch-icon 180 e icones PWA 192/512 existem com o tamanho certo", () => {
    expect(pngSize("apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
    expect(pngSize("icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(pngSize("icon-512.png")).toEqual({ width: 512, height: 512 });
  });

  it("favicon.ico traz duas imagens: 32×32 e 16×16", () => {
    const ico = readFileSync(join(PUBLIC, "favicon.ico"));
    expect(ico.readUInt16LE(2)).toBe(1); // tipo: ícone
    expect(ico.readUInt16LE(4)).toBe(2); // quantidade de imagens
    expect([ico[6], ico[22]]).toEqual([32, 16]);
  });

  it("manifest.webmanifest usa o navy e aponta para ícones que existem", () => {
    const manifest = JSON.parse(read("manifest.webmanifest"));
    expect(manifest.theme_color).toBe("#14243E");
    expect(manifest.background_color).toBe("#14243E");
    for (const icon of manifest.icons) expect(existsSync(join(PUBLIC, icon.src))).toBe(true);
  });

  it("og.jpg tem 1200×630", () => {
    expect(jpegSize("og.jpg")).toEqual({ width: 1200, height: 630 });
  });
});

describe("guard de sessão (middleware)", () => {
  // O matcher do Next usa a sintaxe do path-to-regexp, mas este padrão é um
  // regex comum com lookahead negativo — ancorar reproduz a decisão dele.
  const matcher = new RegExp(`^${middlewareConfig.matcher[0]}$`);
  const guarded = (path: string) => matcher.test(path);

  it.each([
    "/manifest.webmanifest",
    "/favicon.svg",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/brand/reinersmedia_symbol_navy.svg",
    "/estudio/cenario-puff.webp",
    "/bastidores/bastidor-01.webp",
    "/og.jpg",
    "/hero.mp4",
  ])("%s é estático e não passa pelo guard de sessão", (path) => {
    expect(guarded(path)).toBe(false);
  });

  it.each(["/", "/portfolio", "/admin", "/app/board", "/login"])("%s continua passando pelo guard", (path) => {
    expect(guarded(path)).toBe(true);
  });
});
