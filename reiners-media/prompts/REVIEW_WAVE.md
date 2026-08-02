# Revisar Onda

## Passo a passo

1. Liste tickets em IN_REVIEW:
   ```bash
   python3 scripts/ticketctl.py list | grep IN_REVIEW
   ```
2. Para cada ticket, execute revisão independente:
   - O revisor NÃO pode ser o agente que implementou
   - Use `.claude/agents/code-reviewer.md` como guia
3. Registre findings no ticket
4. Se aprovado:
   ```bash
   python3 scripts/ticketctl.py approve TCK-001
   ```
5. Se changes requested:
   ```bash
   python3 scripts/ticketctl.py request-changes TCK-001
   # Aguarde correção e re-revisão
   ```
