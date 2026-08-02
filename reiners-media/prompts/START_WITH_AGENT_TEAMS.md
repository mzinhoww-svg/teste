# Iniciar com Agent Teams (opcional)

## Quando usar
Quando o recurso Agent Teams estiver habilitado no ambiente Claude Code.

## Fallback
Se Agent Teams não estiver disponível, use `START_WITH_SUBAGENTS.md` ou `START_WITH_WORKTREES.md`.

## Configuração
1. Crie um time com os agentes em `.claude/agents/`
2. Atribua tickets por especialidade
3. Use `ticketctl.py` como fonte canônica de estado

## Comando
```bash
python3 scripts/bootstrap.sh
python3 scripts/ticketctl.py wave --max 8
# Delegue cada ticket ao agente correspondente via Agent Teams
```
