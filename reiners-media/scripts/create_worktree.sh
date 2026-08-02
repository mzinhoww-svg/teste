#!/bin/bash
set -e

TICKET_ID=$1
if [ -z "$TICKET_ID" ]; then
    echo "Uso: create_worktree.sh <TICKET-ID>"
    exit 1
fi

WORKTREE_DIR=".claude/worktrees/$TICKET_ID"
BRANCH="ticket/$TICKET_ID"

echo "=== Criando worktree para $TICKET_ID ==="

# Criar branch se não existir
git rev-parse --verify $BRANCH >/dev/null 2>&1 || git branch $BRANCH

# Criar worktree
git worktree add $WORKTREE_DIR $BRANCH || { echo "Worktree já existe"; exit 0; }

echo "✓ Worktree criado: $WORKTREE_DIR (branch: $BRANCH)"
