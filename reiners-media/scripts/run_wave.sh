#!/bin/bash
set -e

ACTION=$1

case $ACTION in
    review)
        echo "=== Revisando onda atual ==="
        python3 scripts/ticketctl.py ready | while read line; do
            ticket_id=$(echo $line | awk '{print $1}')
            python3 scripts/ticketctl.py review $ticket_id
        done
        ;;
    integrate)
        echo "=== Integrando tickets aprovados ==="
        for f in tickets/items/TCK-*.json; do
            status=$(python3 -c "import json; print(json.load(open('$f'))['status'])")
            if [ "$status" = "APPROVED" ]; then
                ticket_id=$(basename $f .json)
                python3 scripts/ticketctl.py integrate $ticket_id
            fi
        done
        ;;
    *)
        echo "Uso: run_wave.sh {review|integrate}"
        exit 1
        ;;
esac
