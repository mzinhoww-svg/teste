# Carrossel Pro

Plugin pra Claude Cowork que cria **carrosseis de Instagram prontos pra publicar** — e ja vem com um **editor visual** pra ajustar e exportar os slides sem mexer em codigo.

## O que tem dentro

- **Habilidade `carrossel-pro`** — o playbook que o Claude carrega sozinho quando voce pede um carrossel. Ele descobre a marca, propoe o sistema visual (tipografia, paleta, voz), escreve a copy slide a slide e gera um `slides.json`.
- **Carousel Studio (`carousel-studio.html`)** — um editor visual standalone. Abre no navegador, edita textos e cores por um painel lateral (sem quebrar o layout), troca a imagem de fundo de cada slide e exporta os PNGs em 1080x1350 (2x). Funciona com os 8 kits tipograficos e os formatos 4:5, 1:1 e 9:16.

## Como usar

1. Peca um carrossel ao Claude ("cria um carrossel sobre X"). A habilidade conduz as perguntas e gera o `slides.json`.
2. Abra o **Carousel Studio** no navegador.
3. Clique em **Importar JSON** e escolha o `slides.json` (ou edite o exemplo que ja vem carregado).
4. Ajuste no painel lateral, escolha as cores e clique em **Exportar PNGs**.
5. Pra guardar as edicoes, use **Salvar JSON** e reimporte depois.

O editor puxa as fontes do Google Fonts e usa internet so pra carregar fontes e exportar; ao exportar, as fontes ficam embutidas no PNG.

## Nota tecnica

O editor (`carousel-studio.html`) e autossuficiente para render e exportacao — e o caminho recomendado. O script Python interno da habilidade e opcional.
