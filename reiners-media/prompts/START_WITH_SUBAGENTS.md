# Iniciar com Subagentes

## Passo a passo

1. Leia `START_HERE.md` e `CLAUDE.md`
2. Execute validação:
   ```bash
   python3 scripts/validate_delivery.py
   python3 scripts/ticketctl.py validate
   ```
3. Consulte tickets prontos:
   ```bash
   python3 scripts/ticketctl.py ready
   ```
4. Calcule a maior onda segura:
   ```bash
   python3 scripts/ticketctl.py wave --max 8
   ```
5. Para cada ticket na onda, use um subagente especializado:
   - Frontend: `frontend-engineer`
   - Backend: `backend-engineer`
   - QA: `qa-engineer`
   - DevOps: `devops-engineer`
6. Acompanhe execução via `ticketctl.py summary`
7. Solicite revisão independente para cada ticket concluído
8. Integre tickets aprovados
9. Desbloqueie dependentes:
   ```bash
   python3 scripts/ticketctl.py unlock
   ```
10. Repita do passo 4

## Comando de inicialização
```bash
python3 scripts/bootstrap.sh
python3 scripts/ticketctl.py wave --max 8
```
