// Abre a central num Chromium com um banco simulado (window.claude.use("db")) e devolve os ganchos para o teste.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const dados = require("./dados.js");

const RAIZ = path.join(__dirname, "..", "..", "central");
const ler = (nome) => fs.readFileSync(path.join(RAIZ, nome), "utf8");

// Roda dentro da página, antes de qualquer script da central.
function simulador(inicial, falharGravacao, atraso) {
  window.__falhar = falharGravacao;  // o teste pode trocar no meio (h.falhar)
  // com atraso, o dado aparece no snapshot na hora (como no banco real) e a promessa só resolve depois
  const resolver = () => (atraso ? new Promise((r) => setTimeout(r, atraso)) : Promise.resolve());
  const docs = { leads: {}, clientes: {}, config: {} };
  const assinantes = [];
  const escritas = [];
  window.__escritas = escritas;
  const copia = (x) => JSON.parse(JSON.stringify(x));
  inicial.leads.forEach((d) => { docs.leads[d.id] = copia(d.data); });
  inicial.clientes.forEach((d) => { docs.clientes[d.id] = copia(d.data); });
  Object.keys(inicial.config).forEach((k) => { if (inicial.config[k]) docs.config[k] = copia(inicial.config[k]); });
  const notificar = () => assinantes.slice().forEach((a) => a());
  const parte = (caminho) => caminho.split("/");
  const doc = (caminho) => {
    const [col, id] = parte(caminho);
    return {
      onSnapshot(cb) {
        const emitir = () => cb({ id, exists: !!docs[col][id], data: () => copia(docs[col][id] || {}) });
        assinantes.push(emitir); emitir();
        return () => {};
      },
      update(d) {
        if (window.__falhar) return Promise.reject({ code: "unavailable" });
        docs[col][id] = Object.assign({}, docs[col][id] || {}, copia(d));
        escritas.push({ caminho, dados: copia(d) });
        notificar();
        return resolver();
      },
      set(d) {
        if (window.__falhar) return Promise.reject({ code: "unavailable" });
        docs[col][id] = copia(d);
        escritas.push({ caminho, dados: copia(d) });
        notificar();
        return resolver();
      },
    };
  };
  const collection = (nome) => ({
    onSnapshot(cb) {
      const emitir = () => cb({ docs: Object.keys(docs[nome]).map((id) => ({ id, exists: true, data: () => copia(docs[nome][id]) })) });
      assinantes.push(emitir); emitir();
      return () => {};
    },
  });
  window.__empurrar = (caminho, d) => {
    const [col, id] = parte(caminho);
    docs[col][id] = Object.assign({}, docs[col][id] || {}, copia(d));
    notificar();
  };
  window.claude = {
    use(nome) {
      if (nome === "downloads") return Promise.resolve({ save: async () => {} });
      return Promise.resolve({ collection, doc });
    },
  };
}

async function abrir(opts) {
  opts = opts || {};
  const largura = opts.largura || 1440;
  const inicial = {
    leads: opts.leads === undefined ? dados.leads(7) : opts.leads,
    clientes: opts.clientes === undefined ? dados.clientes() : opts.clientes,
    // enriquecimento: o documento config/enriquecimento (ausente quando não vem); h.empurrar("config/enriquecimento", {...}) mescla depois
    config: { meta: opts.meta || dados.meta(), fotos: dados.fotos(), posvenda: dados.posvenda(), enriquecimento: opts.enriquecimento || null },
  };
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: largura, height: opts.altura || 900 } });
  const page = await ctx.newPage();
  if (opts.relogio) await page.clock.install();
  const erros = [];
  page.on("pageerror", (e) => erros.push(e));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (opts.tema === "escuro") await page.emulateMedia({ colorScheme: "dark" });

  let html = ler("index.html");
  html = html.replace('<link rel="stylesheet" href="estilo.css">', () => "<style>" + ler("estilo.css") + "</style>");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, f) => "<script>" + ler(f).replace(/<\/script/gi, "<\\/script") + "</script>");
  const mock = "<script>(" + simulador.toString() + ")(" + JSON.stringify(inicial) + "," + JSON.stringify(!!opts.falharGravacao) + "," + JSON.stringify(opts.atraso || 0) + ");</script>";
  const pagina = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<style>[hidden]{display:none!important}body{margin:0}</style>" + mock + html;
  await page.setContent(pagina);

  return {
    page,
    erros,
    escritas: { // lê as escritas da página sob demanda
      async lista() { return page.evaluate(() => window.__escritas.slice()); },
    },
    falhar: (v) => page.evaluate((x) => { window.__falhar = x; }, !!v),
    empurrar: (caminho, d) => page.evaluate(([c, x]) => window.__empurrar(c, x), [caminho, d]),
    fechar: () => browser.close(),
  };
}

module.exports = { abrir };
