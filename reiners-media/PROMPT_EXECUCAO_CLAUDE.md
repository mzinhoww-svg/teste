# Prompt de Execução — Claude Code

## Instrução inicial para o Claude Code

Leia `START_HERE.md` e `CLAUDE.md`. Execute todas as validações iniciais. Consulte os tickets READY e selecione a maior onda segura, sem dependências pendentes e sem sobreposição de write_paths. Faça claim atômico dos tickets, crie worktrees isoladas, delegue cada ticket ao agente especializado correspondente, aguarde as entregas, solicite revisão independente, integre somente tickets aprovados, execute os testes globais, desbloqueie os dependentes e repita o processo. Interrompa a execução diante de falhas críticas, conflitos de ownership ou violações de segurança.

## Protocolo de execução

```bash
# 1. Bootstrap
bash scripts/bootstrap.sh

# 2. Validação
python3 scripts/validate_delivery.py
python3 scripts/ticketctl.py validate
python3 scripts/ticketctl.py summary

# 3. Loop principal
while true; do
    # Calcular onda
    python3 scripts/ticketctl.py wave --max 8

    # Para cada ticket na onda:
    #   - Claim
    python3 scripts/ticketctl.py claim <TICKET> --agent <AGENT>
    #   - Criar worktree
    bash scripts/create_worktree.sh <TICKET>
    #   - Executar (delegar a subagente)
    #   - Validar
    bash scripts/validate_ticket.sh <TICKET>
    #   - Review
    python3 scripts/ticketctl.py review <TICKET>
    #   - Aprovar
    python3 scripts/ticketctl.py approve <TICKET>
    #   - Integrar
    python3 scripts/ticketctl.py integrate <TICKET>
    python3 scripts/ticketctl.py done <TICKET>

    # Desbloquear dependentes
    python3 scripts/ticketctl.py unlock

    # Verificar se há mais trabalho
    python3 scripts/ticketctl.py ready
    # Se vazio, parar
done
```

## Condições de parada
- Nenhum ticket em READY ou BACKLOG
- Falha crítica de segurança
- Conflito de ownership não resolvível
- Falha de validação global
