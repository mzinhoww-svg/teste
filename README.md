# CRM AI Studio — Local & Privado

Uma versão **privada e 100% local** inspirada no [Pipefy CRM AI Studio](https://www.pipefy.com/pt-br/produtos/crm-ai-studio/).
Roda inteiramente na sua máquina: os dados ficam num arquivo SQLite local e os
**agentes de IA rodam num LLM local (Ollama)** — nada é enviado para a nuvem.

> Se o Ollama não estiver rodando, os agentes continuam funcionando usando
> **heurísticas locais**, então o CRM nunca depende de internet.

## O que ele faz

Reproduz os conceitos centrais do CRM AI Studio:

- **Pipelines / funil Kanban** (Marketing → Vendas → Pós-venda) com fases e arraste de cards.
- **Cards (leads/deals)** com contato, empresa, valor, origem, prioridade, notas e campos extras.
- **Agentes de IA embutidos**, executados localmente:
  - **Lead Scoring** — pontua o lead (0–100) e define prioridade.
  - **Qualificação (SDR)** — qualifica com raciocínio BANT/GPCT e sugere próximos passos.
  - **Nutrição / Enriquecimento** — gera insights e plano de follow-up.
  - **Gerador de Propostas** — redige uma proposta comercial em Markdown.
  - **Copilot de Vendas** — chat por deal para e-mails, objeções e próximos passos.
- **Automações por fase** — ao mover um card para uma fase, o agente vinculado roda sozinho.
- **Dashboard** — pipeline aberto, ganho, taxa de conversão, score médio e funil por fase.
- **Histórico/timeline** por card com tudo que os agentes produziram.

## Arquitetura (tudo local)

```
Navegador (SPA vanilla) ──HTTP──► Node/Express (localhost:4321)
                                     │
                                     ├─ SQLite  (./data/crm.db)   ← seus dados
                                     └─ Ollama  (localhost:11434) ← LLM local
                                          └─ fallback heurístico se offline
```

- **Backend:** Node.js + Express + `better-sqlite3`. Sem serviços externos.
- **Frontend:** HTML/CSS/JS puro, servido pelo próprio backend. Sem build.
- **IA:** cliente HTTP para o Ollama; prompts e fallback em `server/ai.js`.

## Como rodar

Pré-requisitos: **Node.js 18+**. (Opcional, para IA de verdade: [Ollama](https://ollama.com).)

```bash
npm install
npm start
# abra http://localhost:4321
```

Na primeira execução um pipeline de exemplo ("Funil de Vendas") é criado com
leads de demonstração, agentes e automações.

### Ativando a IA local (opcional)

```bash
# instale o Ollama (https://ollama.com), depois baixe um modelo:
ollama pull llama3.2
# o CRM detecta o Ollama automaticamente; troque o modelo via OLLAMA_MODEL
```

Sem o Ollama, o selo no topo mostra **"IA: heurística"** e os agentes usam regras locais.

## Configuração

Copie `.env.example` para `.env` (todas as variáveis são opcionais):

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `4321` | Porta do servidor local |
| `OLLAMA_URL` | `http://localhost:11434` | Endpoint do Ollama |
| `OLLAMA_MODEL` | `llama3.2` | Modelo local usado pelos agentes |
| `CRM_DATA_DIR` | `./data` | Pasta do banco SQLite |

## API (resumo)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/status` | Status + disponibilidade do LLM |
| GET | `/api/pipelines` | Lista pipelines |
| POST | `/api/pipelines` | Cria pipeline (com fases padrão) |
| GET | `/api/pipelines/:id/board` | Fases + cards |
| GET | `/api/pipelines/:id/metrics` | Métricas do dashboard |
| POST | `/api/cards` | Cria card |
| PATCH | `/api/cards/:id` | Edita card |
| POST | `/api/cards/:id/move` | Move de fase (dispara automações) |
| POST | `/api/cards/:id/agents/:key` | Roda um agente (`scorer`/`qualifier`/`enricher`/`proposal`/`copilot`) |

## Privacidade

- Nenhuma chamada de rede além do Ollama **na sua própria máquina**.
- Os dados vivem apenas em `./data/crm.db` (ignorado pelo Git).
- Zero telemetria, zero contas, zero nuvem.
