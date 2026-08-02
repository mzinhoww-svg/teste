#!/bin/bash
set -e

echo "=== Bootstrap Reiners Media Delivery ==="

# Criar diretórios de estado
mkdir -p tickets/state/locks
mkdir -p tickets/state/history
mkdir -p .claude/worktrees
mkdir -p reports

# Validar Python
python3 --version || { echo "Python 3 não encontrado"; exit 1; }

# Validar pacote
python3 scripts/validate_delivery.py || { echo "Validação falhou"; exit 1; }

# Gerar manifest
python3 scripts/ticketctl.py regenerate

echo "✓ Bootstrap completo"
