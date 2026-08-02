# Integrar Onda

## Passo a passo

1. Verifique tickets APPROVED:
   ```bash
   python3 scripts/ticketctl.py list | grep APPROVED
   ```
2. Para cada ticket aprovado:
   ```bash
   python3 scripts/ticketctl.py integrate TCK-001
   ```
3. Execute validações globais:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test:unit
   pnpm test:integration
   ```
4. Se tudo passar:
   ```bash
   python3 scripts/ticketctl.py done TCK-001
   ```
5. Desbloqueie dependentes:
   ```bash
   python3 scripts/ticketctl.py unlock
   ```
6. Regenere manifest:
   ```bash
   python3 scripts/ticketctl.py regenerate
   ```
