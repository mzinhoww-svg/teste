# Reiners Media Podcast Studio — Claude Delivery Package

## Sobre
Este pacote contém todo o sistema de gestão de tickets, documentação e scripts necessários para executar o desenvolvimento do Estúdio de Podcast Reiners Media via Claude Code com múltiplos agentes paralelos.

## Estrutura
```
├── START_HERE.md              # Ponto de entrada operacional
├── CLAUDE.md                  # Protocolo do agente principal
├── PROMPT_EXECUCAO_CLAUDE.md  # Prompt de execução
├── DELIVERY_SUMMARY.md        # Resumo da entrega
├── docs/                      # Documentação do produto
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── CHECKLISTS.md
│   └── ...
├── tickets/                   # Sistema de tickets
│   ├── items/TCK-*.json      # 25 tickets
│   ├── manifest.json
│   ├── waves.json
│   └── ...
├── scripts/                   # Scripts operacionais
│   ├── ticketctl.py
│   ├── validate_delivery.py
│   ├── path_guard.py
│   └── *.sh
├── .claude/agents/            # Agentes especializados
├── prompts/                   # Prompts de execução
└── contracts/                 # Contratos de API
```

## Início rápido
```bash
# 1. Bootstrap
bash scripts/bootstrap.sh

# 2. Validar
python3 scripts/validate_delivery.py

# 3. Ver tickets prontos
python3 scripts/ticketctl.py ready

# 4. Calcular onda
python3 scripts/ticketctl.py wave --max 8

# 5. Claim e executar
python3 scripts/ticketctl.py claim TCK-001 --agent frontend-engineer
bash scripts/create_worktree.sh TCK-001
```

## Stack
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- Prisma + Supabase
- Vercel

## Tickets
- **Total**: 25
- **Ondas**: 6
- **Concorrência máxima**: 5 (Wave 3)
- **Média independence score**: 91.2
- **Caminho crítico**: TCK-002 → TCK-005 → TCK-013 → TCK-014 → TCK-015 → TCK-023 → TCK-024
