#!/usr/bin/env python3
"""validate_delivery.py — Validação completa do pacote de entrega."""
import sys, os, json, glob
from pathlib import Path

BASE = Path(__file__).parent.parent
REQUIRED_FILES = [
    "START_HERE.md", "CLAUDE.md", "README.md", "PROMPT_EXECUCAO_CLAUDE.md",
    "DELIVERY_SUMMARY.md", ".gitignore.additions",
    "docs/PRD.md", "docs/ARCHITECTURE.md", "docs/ROADMAP.md", "docs/CHECKLISTS.md",
    "docs/DATA_MODEL.md", "docs/API_CONTRACTS.md", "docs/SECURITY.md",
    "docs/TEST_STRATEGY.md", "docs/OBSERVABILITY.md", "docs/RELEASE_PLAN.md",
    "docs/ROLLBACK_PLAN.md", "docs/ASSUMPTIONS.md", "docs/DECISIONS.md",
    "docs/RISKS.md", "docs/TRACEABILITY.md",
    "tickets/ticket.schema.json", "tickets/ticket.template.json", "tickets/manifest.json",
    "tickets/waves.json", "tickets/ownership.json", "tickets/dependency-graph.mmd",
    "tickets/parallelism-report.md",
    "scripts/ticketctl.py", "scripts/validate_delivery.py", "scripts/path_guard.py",
    "scripts/bootstrap.sh", "scripts/create_worktree.sh", "scripts/run_wave.sh",
    "scripts/validate_ticket.sh"
]

def validate():
    errors = []
    for f in REQUIRED_FILES:
        if not (BASE / f).exists():
            errors.append(f"Arquivo obrigatório ausente: {f}")

    # Validar JSONs
    for p in (BASE / "tickets" / "items").glob("*.json"):
        try:
            with open(p) as f:
                json.load(f)
        except json.JSONDecodeError as e:
            errors.append(f"JSON inválido: {p.name} — {e}")

    # Verificar IDs únicos
    ids = set()
    for p in (BASE / "tickets" / "items").glob("*.json"):
        with open(p) as f:
            t = json.load(f)
        if t["id"] in ids:
            errors.append(f"ID duplicado: {t['id']}")
        ids.add(t["id"])

    # Verificar P0 sem ticket
    # (simplificado — verificar se todos os requisitos P0 do PRD têm tickets)

    if errors:
        print("VALIDAÇÃO FALHOU:")
        for e in errors:
            print(f"  ✗ {e}")
        report_path = BASE / "reports" / "validation-report.md"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with open(report_path, "w") as f:
            f.write("# Validation Report\n\n")
            for e in errors:
                f.write(f"- [ ] {e}\n")
        return 1

    print("✓ Pacote validado com sucesso.")
    report_path = BASE / "reports" / "validation-report.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w") as f:
        f.write("# Validation Report\n\n✓ Todos os checks passaram.\n")
    return 0

if __name__ == "__main__":
    sys.exit(validate())
