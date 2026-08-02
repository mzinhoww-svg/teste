#!/usr/bin/env python3
"""path_guard.py — Proteção de paths para tickets."""
import sys, json, os
from pathlib import Path

def guard(ticket_id, changed_files):
    base = Path(__file__).parent.parent
    ticket_path = base / "tickets" / "items" / f"{ticket_id}.json"
    if not ticket_path.exists():
        print(f"Ticket não encontrado: {ticket_id}")
        return 1
    with open(ticket_path) as f:
        ticket = json.load(f)

    allowed = set(ticket.get("write_paths", []))
    forbidden = set(ticket.get("forbidden_paths", []))

    for cf in changed_files:
        for fb in forbidden:
            if cf.startswith(fb.replace("*", "")) or fb in cf:
                print(f"VIOLAÇÃO: {cf} está em forbidden_paths")
                return 1
        allowed_match = any(cf.startswith(ap.replace("*", "")) or ap in cf for ap in allowed)
        if not allowed_match:
            print(f"AVISO: {cf} não está em write_paths do ticket {ticket_id}")

    print("✓ Paths validados")
    return 0

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: path_guard.py <TICKET-ID> <file1> [file2...]")
        sys.exit(1)
    sys.exit(guard(sys.argv[1], sys.argv[2:]))
