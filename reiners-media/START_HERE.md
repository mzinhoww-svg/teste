# Reiners Media — Pacote de Entrega para Claude Code

## Objetivo

Este pacote contém tudo necessário para executar o desenvolvimento do **Estúdio de Podcast Reiners Media** (landing page + portfólio Netflix-style + admin) via Claude Code com múltiplos agentes paralelos.

## Pré-requisitos

- Node.js 20+
- pnpm (ou npm/yarn)
- Git
- Conta Vercel (para deploy)
- Conta Supabase (para banco + auth + storage)
- Python 3.10+ (para scripts de gestão de tickets)

## Como copiar o pacote

```bash
# Descompacte na raiz do repositório
unzip reiners-media-claude-delivery.zip -d ./
# Ou copie o conteúdo da pasta para a raiz do projeto
cp -r reiners-media-claude-delivery/* ./
```

## Instalação de dependências

```bash
# 1. Instalar dependências do projeto
pnpm install

# 2. Instalar dependências Python dos scripts (apenas stdlib, nenhuma extra)
# Nenhuma dependência externa necessária — os scripts usam apenas a biblioteca padrão.

# 3. Configurar variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais Supabase
```

## Validação do pacote

```bash
python3 scripts/validate_delivery.py
```

Deve retornar exit code 0. Se falhar, leia `reports/validation-report.md`.

## Consultar tickets prontos

```bash
python3 scripts/ticketctl.py ready
python3 scripts/ticketctl.py wave --max 8
```

## Executar uma onda

```bash
# 1. Ver a próxima onda segura
python3 scripts/ticketctl.py wave

# 2. Para cada ticket da onda, criar worktree e executar
python3 scripts/ticketctl.py claim TCK-005 --agent backend-engineer
bash scripts/create_worktree.sh TCK-005
# No worktree, execute o ticket com Claude Code
claude --worktree TCK-005

# 3. Após implementação, validar
bash scripts/validate_ticket.sh TCK-005
```

## Iniciar com worktrees

```bash
bash scripts/bootstrap.sh
python3 scripts/ticketctl.py wave
# Para cada ticket na onda:
bash scripts/create_worktree.sh <TICKET-ID>
```

## Iniciar com subagentes

```bash
# Leia prompts/START_WITH_SUBAGENTS.md
# O orchestrator delegará tickets a subagentes especializados
```

## Revisar uma onda

```bash
python3 scripts/ticketctl.py review TCK-005
# Ou revise todos da onda atual
bash scripts/run_wave.sh review
```

## Integrar uma onda

```bash
python3 scripts/ticketctl.py integrate TCK-005
# Ou integre todos aprovados
bash scripts/run_wave.sh integrate
```

## Desbloquear tickets dependentes

```bash
python3 scripts/ticketctl.py unlock
# Automaticamente move BLOCKED -> READY quando dependências concluídas
```

## Recuperar execução interrompida

```bash
python3 scripts/ticketctl.py summary
python3 scripts/ticketctl.py regenerate
# Reconstrói manifest.json e relatórios a partir do estado atual dos tickets
```

## Estado geral

```bash
python3 scripts/ticketctl.py summary
python3 scripts/ticketctl.py graph
python3 scripts/ticketctl.py ownership
```

## Comandos rápidos

| Ação | Comando |
|------|---------|
| Validar pacote | `python3 scripts/validate_delivery.py` |
| Listar tickets | `python3 scripts/ticketctl.py list` |
| Ver ticket | `python3 scripts/ticketctl.py show TCK-005` |
| Próxima onda | `python3 scripts/ticketctl.py wave --max 8` |
| Claim ticket | `python3 scripts/ticketctl.py claim TCK-005 --agent backend-engineer` |
| Iniciar ticket | `python3 scripts/ticketctl.py start TCK-005` |
| Revisar ticket | `python3 scripts/ticketctl.py review TCK-005` |
| Aprovar ticket | `python3 scripts/ticketctl.py approve TCK-005` |
| Conflitos | `python3 scripts/ticketctl.py conflicts` |

## Documentos essenciais

1. `CLAUDE.md` — Protocolo operacional do agente principal
2. `docs/PRD.md` — Product Requirements Document
3. `docs/ARCHITECTURE.md` — Arquitetura do sistema
4. `docs/ROADMAP.md` — Roadmap e ondas de execução
5. `tickets/manifest.json` — Manifesto de todos os tickets
