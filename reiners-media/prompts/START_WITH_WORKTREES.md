# Iniciar com Worktrees

## Passo a passo

1. Bootstrap:
   ```bash
   bash scripts/bootstrap.sh
   ```
2. Calcule a onda:
   ```bash
   python3 scripts/ticketctl.py wave --max 8
   ```
3. Para cada ticket, crie worktree:
   ```bash
   bash scripts/create_worktree.sh TCK-001
   cd .claude/worktrees/TCK-001
   ```
4. No worktree, execute o Claude Code:
   ```bash
   claude --worktree TCK-001
   ```
5. Após implementação, valide:
   ```bash
   bash scripts/validate_ticket.sh TCK-001
   ```
6. Mova para review:
   ```bash
   python3 scripts/ticketctl.py review TCK-001
   ```
7. Após aprovação, integre:
   ```bash
   python3 scripts/ticketctl.py integrate TCK-001
   python3 scripts/ticketctl.py done TCK-001
   ```
8. Limpe worktree:
   ```bash
   git worktree remove .claude/worktrees/TCK-001
   ```
