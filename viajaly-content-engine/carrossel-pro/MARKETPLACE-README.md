# Carrossel Pro

Marketplace de plugin pro **Claude Cowork / Claude Code**. Instala a habilidade **carrossel-pro**, que cria carrosseis de Instagram prontos pra publicar e entrega um **editor visual** (Carousel Studio) ja preenchido com o carrossel gerado — pra ajustar textos, tipografia, cores, imagem de fundo, cantos e exportar os PNGs em ZIP.

---

## Instalar

### Claude Cowork (app desktop)
1. Configuracoes -> Plugins -> **Adicionar marketplace**.
2. Fonte **GitHub** -> informe: `NetoNetoArreche/carrossel-pro-marketplace`
3. Instale o plugin **carrossel-pro** no catalogo.

### Claude Code (terminal)
```bash
/plugin marketplace add NetoNetoArreche/carrossel-pro-marketplace
/plugin install carrossel-pro@carrossel-pro-marketplace
```

## Usar

Depois de instalar, peca: **"cria um carrossel sobre X"**. A habilidade conduz as perguntas, escreve a copy e entrega o `carrossel-editor.html` ja preenchido. Abra no navegador, ajuste e clique em **Exportar ZIP**.

---

## Para o mantenedor (atualizar o plugin)

Edite o que quiser em `plugins/carrossel-pro/` (ex.: `carousel-studio.html` ou `skills/carrossel-pro/SKILL.md`) e rode:

```bash
./atualizar.sh          # sobe o patch (1.6.0 -> 1.6.1) e da push
./atualizar.sh minor    # 1.6.0 -> 1.7.0
./atualizar.sh 2.0.0    # versao exata
```

O script atualiza a versao no `plugin.json` e no `marketplace.json`, faz commit e push. Quem ja instalou recebe a atualizacao ao atualizar o marketplace (Cowork: refresh; Claude Code: `/plugin marketplace update`).

## Estrutura

```
carrossel-pro-marketplace/
├── .claude-plugin/marketplace.json   # catalogo
├── plugins/carrossel-pro/            # o plugin (habilidade + editor)
├── atualizar.sh                      # sobe versao e publica
└── README.md
```

## Licenca
MIT.
