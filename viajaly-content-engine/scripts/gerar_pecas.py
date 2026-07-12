#!/usr/bin/env python3
"""
VIAJALY -- CONSTRUTOR DE PECAS (substitui o passo manual do carrossel-pro)

Le um arquivo de copy (pecas_semana.json) com N pecas, cada uma ANGULO x PERSONA,
e emite, para CADA peca:

    saida/pecas/<data>_<combo>.json     peca completa (entra no gate.py e no render)
    saida/pecas/<data>_<combo>.html     carrossel-editor.html populado (abre no browser)
    saida/pecas/<data>_<combo>.txt      legenda (gancho + CTA + hashtags)
    saida/render/<combo>/NN-tipo.png     (opcional, --render) PNGs 1080x1350

E a "otimizacao pro carrossel-pro": trava o SISTEMA VISUAL VIAJALY (5 regras de
composicao do DESIGN-CARROSSEL.md) num gerador reprodutivel, em vez de depender
da skill estar instalada. Mesma paleta, mesma hierarquia, mesmo disclaimer-arma.

Uso:
    python3 scripts/gerar_pecas.py                     # so JSON+HTML+legenda
    python3 scripts/gerar_pecas.py --render            # tambem renderiza os PNGs
    python3 scripts/gerar_pecas.py --spec outro.json
"""

import argparse
import html
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SPEC = BASE / "saida" / "pecas_semana.json"
PECAS = BASE / "saida" / "pecas"
RENDER = BASE / "saida" / "render"

DISCLAIMER = ("A Viajaly nao garante aprovacao de vistos. "
              "A decisao e exclusiva das autoridades consulares.")

# ---------------------------------------------------------------------------
# HTML: carrossel-editor.html — editor/preview fiel ao DESIGN-CARROSSEL.md.
# Self-contained (CSS inline). Renderiza cada slide como card 4:5, com:
#   numero fantasma, kicker coral, texto ancorado no rodape, palavra coral,
#   slide insight areia, botao coral solido no CTA + disclaimer abaixo.
# Campos editaveis (contenteditable) pra ajuste fino antes de exportar.
# ---------------------------------------------------------------------------
HTML_TEMPLATE = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Viajaly - {combo} - carrossel-editor</title>
<style>
  :root {{
    --navy:#10204A; --areia:#FFF6ED; --coral:#FF5A5F; --ceu:#2DB7C9;
    --muted:#8B93A8; --surface:#1A2E5C;
  }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ background:#0b1836; color:var(--areia);
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    padding:32px 20px 80px; }}
  .head {{ max-width:1100px; margin:0 auto 28px; }}
  .head h1 {{ font-size:20px; font-weight:800; letter-spacing:.02em; }}
  .head .meta {{ color:var(--muted); font-size:13px; margin-top:6px; line-height:1.6; }}
  .head .tag {{ display:inline-block; background:var(--surface); color:var(--areia);
    padding:2px 10px; border-radius:99px; font-size:12px; margin-right:6px; }}
  .head .coral {{ color:var(--coral); font-weight:700; }}
  .grid {{ max-width:1100px; margin:0 auto; display:grid;
    grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:22px; }}
  .slide {{ position:relative; aspect-ratio:4/5; background:var(--navy);
    border-radius:14px; overflow:hidden; padding:9%; display:flex;
    flex-direction:column; justify-content:flex-end; box-shadow:0 8px 30px rgba(0,0,0,.35); }}
  .slide.insight {{ background:var(--areia); color:var(--navy); justify-content:center; }}
  .slide.capa-foto {{ background-size:cover; background-position:center; }}
  .slide.capa-foto::after {{ content:''; position:absolute; inset:0; z-index:1;
    background:linear-gradient(180deg,rgba(16,32,74,.15) 0%,rgba(16,32,74,.55) 55%,rgba(16,32,74,.93) 100%); }}
  .ghost {{ position:absolute; right:-2%; font-weight:800; color:var(--surface);
    font-size:44vw; line-height:.8; z-index:0; pointer-events:none; }}
  .slide .ghost {{ font-size:min(52vw,300px); }}
  .top {{ position:absolute; top:9%; left:9%; display:flex; align-items:center;
    gap:10px; z-index:2; }}
  .top .bar {{ width:10px; height:30px; background:var(--coral); border-radius:2px; }}
  .kicker {{ color:var(--coral); font-weight:800; font-size:13px;
    letter-spacing:.14em; text-transform:uppercase; z-index:2; }}
  .content {{ position:relative; z-index:2; }}
  .title {{ font-weight:800; font-size:30px; line-height:1.08; }}
  .step-title {{ font-weight:800; font-size:24px; line-height:1.1; margin-bottom:12px; }}
  .rule {{ width:64px; height:5px; background:var(--ceu); border-radius:3px; margin:16px 0; }}
  .body {{ color:var(--muted); font-size:15px; line-height:1.45; }}
  .sub {{ color:var(--muted); font-size:15px; line-height:1.4; }}
  .insight .quote {{ font-weight:800; font-size:26px; line-height:1.2;
    border-left:6px solid var(--coral); padding-left:22px; }}
  .insight .fonte {{ color:#6e6357; font-size:13px; margin-top:16px; padding-left:28px; }}
  em.hl {{ color:var(--coral); font-style:normal; }}
  .insight em.hl {{ color:var(--coral); }}
  .cta-btn {{ display:inline-block; background:var(--coral); color:var(--areia);
    font-weight:800; font-size:17px; padding:16px 30px; border-radius:40px;
    margin-top:22px; align-self:flex-start; }}
  .disclaimer {{ color:var(--muted); font-size:12px; line-height:1.4; margin-top:18px; }}
  .foot {{ position:absolute; left:9%; bottom:6%; z-index:2; font-weight:800;
    font-size:14px; color:var(--areia); }}
  .insight .foot {{ color:var(--navy); }}
  .foot .dot {{ display:inline-block; width:7px; height:7px; border-radius:99px;
    background:var(--coral); margin-left:3px; vertical-align:middle; }}
  .pag {{ position:absolute; right:9%; bottom:6%; z-index:2; color:var(--muted);
    font-size:12px; font-weight:700; }}
  .cap {{ max-width:1100px; margin:34px auto 0; background:var(--surface);
    border-radius:12px; padding:20px 22px; }}
  .cap h2 {{ font-size:13px; color:var(--coral); letter-spacing:.1em;
    text-transform:uppercase; margin-bottom:10px; }}
  .cap pre {{ white-space:pre-wrap; font:inherit; color:var(--areia);
    font-size:14px; line-height:1.55; }}
  [contenteditable]:focus {{ outline:2px dashed var(--ceu); outline-offset:3px; }}
</style>
</head>
<body>
  <div class="head">
    <h1>{combo} <span class="coral">{conta}</span></h1>
    <div class="meta">
      <span class="tag">{pilar}</span><span class="tag">{data}</span>
      <span class="tag">4:5 - 1080x1350</span><span class="tag">kit corporate</span><br>
      <b>Tese:</b> {tese}<br>
      <b>Persona:</b> {persona} - dor: {dor}<br>
      {fonte_html}
    </div>
  </div>
  <div class="grid">
    {slides_html}
  </div>
  <div class="cap">
    <h2>Legenda</h2>
    <pre contenteditable="true">{legenda}</pre>
  </div>
</body>
</html>
"""


def hl(texto, destaques):
    """Envolve palavras-chave em <em class=hl> (coral). Escapa o resto."""
    dset = {d.strip(".,!?:;").lower() for d in destaques}
    out = []
    for palavra in texto.split():
        limpa = palavra.strip(".,!?:;").lower()
        esc = html.escape(palavra)
        out.append(f'<em class="hl">{esc}</em>' if limpa in dset else esc)
    return " ".join(out)


def slide_html(s, n, total):
    tipo = s["tipo"]
    ghost = html.escape(s.get("ghost", s.get("numero", f"{n:02d}")))
    pag = f"{n:02d} / {total:02d}"
    if tipo == "capa":
        return f"""<div class="slide" contenteditable="true">
      <div class="ghost">{ghost}</div>
      <div class="top"><span class="bar"></span><span class="kicker">{html.escape(s.get('kicker',''))}</span></div>
      <div class="content">
        <div class="title">{hl(s['titulo'], s.get('destaques',[]))}</div>
        <div class="rule"></div>
        <div class="sub">{html.escape(s.get('sub',''))}</div>
      </div>
      <div class="foot">viajaly<span class="dot"></span></div>
    </div>"""
    if tipo == "capa_foto":
        bg = "../../" + html.escape(s["imagem"])
        return f"""<div class="slide capa-foto" style="background-image:url('{bg}')" contenteditable="true">
      <div class="top"><span class="bar"></span><span class="kicker">{html.escape(s.get('kicker',''))}</span></div>
      <div class="content">
        <div class="title">{hl(s['titulo'], s.get('destaques',[]))}</div>
        <div class="rule"></div>
        <div class="sub">{html.escape(s.get('sub',''))}</div>
      </div>
      <div class="foot">viajaly<span class="dot"></span></div>
    </div>"""
    if tipo == "passo":
        return f"""<div class="slide" contenteditable="true">
      <div class="ghost">{ghost}</div>
      <div class="top"><span class="bar"></span><span class="kicker">passo {ghost}</span></div>
      <div class="content">
        <div class="step-title">{html.escape(s['titulo'])}</div>
        <div class="rule"></div>
        <div class="body">{hl(s.get('corpo',''), s.get('destaques',[]))}</div>
      </div>
      <div class="foot">viajaly<span class="dot"></span></div>
      <div class="pag">{pag}</div>
    </div>"""
    if tipo == "insight":
        fonte = f'<div class="fonte">{html.escape(s["fonte"])}</div>' if s.get("fonte") else ""
        return f"""<div class="slide insight" contenteditable="true">
      <div class="content">
        <div class="quote">{hl(s['texto'], s.get('destaques',[]))}</div>
        {fonte}
      </div>
      <div class="foot">viajaly<span class="dot"></span></div>
      <div class="pag">{pag}</div>
    </div>"""
    if tipo == "cta":
        return f"""<div class="slide" contenteditable="true">
      <div class="top"><span class="bar"></span><span class="kicker">agora voce sabe</span></div>
      <div class="content">
        <div class="title">{hl(s['titulo'], s.get('destaques',[]))}</div>
        <div class="cta-btn">{html.escape(s.get('acao','Chama no WhatsApp'))}</div>
        <div class="disclaimer">{html.escape(s.get('sub',''))}</div>
      </div>
      <div class="foot">viajaly<span class="dot"></span></div>
      <div class="pag">{pag}</div>
    </div>"""
    raise ValueError(f"tipo desconhecido: {tipo}")


def build(peca):
    total = len(peca["slides"])
    slides_html = "\n    ".join(slide_html(s, i, total)
                                for i, s in enumerate(peca["slides"], 1))
    fonte_html = ""
    if peca.get("fonte_url"):
        fonte_html = (f'<b>Fonte:</b> {html.escape(peca["fonte_url"])} '
                      f'(verif. {peca.get("fonte_verificada_em","-")})')
    return HTML_TEMPLATE.format(
        combo=html.escape(peca["combo"]), conta=html.escape(peca["conta"]),
        pilar=html.escape(peca["pilar"]), data=html.escape(peca["data"]),
        tese=html.escape(peca.get("tese", "")), persona=html.escape(peca.get("persona", "")),
        dor=html.escape(peca.get("dor", "")), fonte_html=fonte_html,
        slides_html=slides_html, legenda=html.escape(peca.get("legenda", "")),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", default=str(SPEC))
    ap.add_argument("--render", action="store_true")
    args = ap.parse_args()

    spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
    pecas = spec["pecas"]
    PECAS.mkdir(parents=True, exist_ok=True)

    if args.render:
        import sys
        sys.path.insert(0, str(BASE / "scripts"))
        from render_slide import render_peca

    for p in pecas:
        stem = f"{p['data']}_{p['combo']}"
        # garante disclaimer no ultimo slide
        ultimo = p["slides"][-1]
        if ultimo["tipo"] == "cta" and DISCLAIMER.split(".")[0] not in ultimo.get("sub", ""):
            ultimo["sub"] = DISCLAIMER
        (PECAS / f"{stem}.json").write_text(
            json.dumps(p, ensure_ascii=False, indent=2), encoding="utf-8")
        (PECAS / f"{stem}.html").write_text(build(p), encoding="utf-8")
        (PECAS / f"{stem}.txt").write_text(p.get("legenda", ""), encoding="utf-8")
        if args.render:
            render_peca({**p, "_base_dir": str(BASE)}, RENDER / p["combo"])
        print(f"  ok {stem}  ({len(p['slides'])} slides)")

    print(f"\n{len(pecas)} pecas -> {PECAS}")


if __name__ == "__main__":
    main()
