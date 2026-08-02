#!/bin/bash
set -e

TICKET_ID=$1
if [ -z "$TICKET_ID" ]; then
    echo "Uso: validate_ticket.sh <TICKET-ID>"
    exit 1
fi

echo "=== Validando $TICKET_ID ==="

# Verificar status (campo exato, não grep no JSON inteiro)
STATUS=$(python3 -c "import json; print(json.load(open('tickets/items/$TICKET_ID.json'))['status'])")
if [ "$STATUS" != "IN_PROGRESS" ]; then
    echo "Ticket não está IN_PROGRESS (status atual: $STATUS)"
    exit 1
fi

# Executar de fato os comandos de validação do ticket
CMDS_FILE=$(mktemp)
python3 -c "
import json
t = json.load(open('tickets/items/$TICKET_ID.json'))
print('\n'.join(t.get('validation_commands', [])))
" > "$CMDS_FILE"

FAILED=0
while IFS= read -r cmd; do
    [ -z "$cmd" ] && continue
    echo "--- Executando: $cmd"
    if ! eval "$cmd"; then
        echo "✗ FALHOU: $cmd"
        FAILED=1
    fi
done < "$CMDS_FILE"
rm -f "$CMDS_FILE"

if [ "$FAILED" -ne 0 ]; then
    echo "✗ Validação de $TICKET_ID falhou"
    exit 1
fi

echo "✓ Ticket $TICKET_ID validado"
