#!/usr/bin/env python3
"""ticketctl.py — Sistema de gestão de tickets para Claude Code."""
import sys, os, json, glob, argparse
from pathlib import Path

BASE = Path(__file__).parent.parent
TICKETS_DIR = BASE / "tickets" / "items"
LOCKS_DIR = BASE / "tickets" / "state" / "locks"
HISTORY_DIR = BASE / "tickets" / "state" / "history"
SCHEMA_PATH = BASE / "tickets" / "ticket.schema.json"
MANIFEST_PATH = BASE / "tickets" / "manifest.json"

STATES = ["BACKLOG", "READY", "CLAIMED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW",
          "CHANGES_REQUESTED", "APPROVED", "INTEGRATING", "DONE", "CANCELLED"]
VALID_TRANSITIONS = {
    "BACKLOG": ["READY"],
    "READY": ["CLAIMED", "BACKLOG"],
    "CLAIMED": ["IN_PROGRESS", "BACKLOG"],
    "IN_PROGRESS": ["BLOCKED", "IN_REVIEW"],
    "BLOCKED": ["READY", "IN_PROGRESS"],
    "IN_REVIEW": ["CHANGES_REQUESTED", "APPROVED"],
    "CHANGES_REQUESTED": ["IN_PROGRESS"],
    "APPROVED": ["INTEGRATING"],
    "INTEGRATING": ["DONE", "APPROVED"],
    "DONE": [],
    "CANCELLED": []
}

def load_ticket(ticket_id):
    path = TICKETS_DIR / f"{ticket_id}.json"
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)

def save_ticket(ticket):
    path = TICKETS_DIR / f"{ticket['id']}.json"
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(ticket, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)

def get_all_tickets():
    tickets = []
    for p in sorted(TICKETS_DIR.glob("TCK-*.json")):
        with open(p) as f:
            tickets.append(json.load(f))
    return tickets

def cmd_validate(args):
    errors = []
    tickets = get_all_tickets()
    known_ids = [t["id"] for t in tickets]
    ids = set()
    for t in tickets:
        if t["id"] in ids:
            errors.append(f"ID duplicado: {t['id']}")
        ids.add(t["id"])
        if t["status"] not in STATES:
            errors.append(f"{t['id']}: estado inválido {t['status']}")
        for dep in t.get("dependencies", []):
            if dep not in known_ids:
                errors.append(f"{t['id']}: dependência inexistente {dep}")
        if not t.get("acceptance_criteria"):
            errors.append(f"{t['id']}: sem critérios de aceitação")
        if not t.get("write_paths"):
            errors.append(f"{t['id']}: sem write_paths")
    if errors:
        print("VALIDAÇÃO FALHOU:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"✓ {len(tickets)} tickets validados. Sem erros.")
    return 0

def cmd_list(args):
    tickets = get_all_tickets()
    for t in tickets:
        print(f"{t['id']} | {t['status']:15} | {t['priority']} | {t['title'][:50]}")

def cmd_show(args):
    t = load_ticket(args.ticket_id)
    if not t:
        print(f"Ticket não encontrado: {args.ticket_id}")
        return 1
    print(json.dumps(t, indent=2, ensure_ascii=False))

def cmd_ready(args):
    tickets = get_all_tickets()
    ready = []
    for t in tickets:
        if t["status"] not in ("BACKLOG", "READY"):
            continue
        deps_ok = all(
            load_ticket(d) and load_ticket(d)["status"] in ("DONE", "INTEGRATING", "APPROVED")
            for d in t.get("dependencies", [])
        )
        if deps_ok:
            ready.append(t)
    for t in ready:
        print(f"{t['id']} | {t['priority']} | score={t['independence_score']} | {t['title'][:50]}")
    return 0

def cmd_wave(args):
    tickets = get_all_tickets()
    max_concurrency = args.max if args.max else 8
    # Dependências são verificadas SEMPRE, inclusive para tickets já marcados
    # READY no pacote — caso contrário a onda pode incluir um ticket cuja
    # dependência ainda não foi concluída (viola a regra absoluta 1).
    def deps_ok(t):
        return all(
            load_ticket(d) and load_ticket(d)["status"] in ("DONE", "INTEGRATING", "APPROVED")
            for d in t.get("dependencies", [])
        )
    ready = [t for t in tickets if t["status"] in ("READY", "BACKLOG") and deps_ok(t)]
    ready.sort(key=lambda t: (-t["independence_score"], t["priority"]))
    selected = []
    used_paths = set()
    for t in ready:
        if len(selected) >= max_concurrency:
            break
        conflicts = False
        for wp in t.get("write_paths", []):
            for up in used_paths:
                if wp.startswith(up) or up.startswith(wp):
                    conflicts = True
                    break
            if conflicts:
                break
        if not conflicts:
            selected.append(t)
            for wp in t.get("write_paths", []):
                used_paths.add(wp)
    print(f"Onda calculada: {len(selected)} tickets")
    for t in selected:
        print(f"  {t['id']} | {t['recommended_agent']} | {t['title'][:50]}")
    return 0

def cmd_claim(args):
    t = load_ticket(args.ticket_id)
    if not t:
        print(f"Ticket não encontrado: {args.ticket_id}")
        return 1
    if t["status"] != "READY":
        print(f"Ticket não está READY: {t['status']}")
        return 1
    lock_path = LOCKS_DIR / f"{args.ticket_id}.lock"
    LOCKS_DIR.mkdir(parents=True, exist_ok=True)
    if lock_path.exists():
        print(f"Ticket já claimed: {args.ticket_id}")
        return 1
    with open(lock_path, "w") as f:
        json.dump({"agent": args.agent, "claimed_at": "2026-08-02T13:30:00Z"}, f)
    t["status"] = "CLAIMED"
    t["claim"] = {"agent": args.agent, "claimed_at": "2026-08-02T13:30:00Z", "worktree": None, "branch": None}
    save_ticket(t)
    print(f"✓ {args.ticket_id} claimed por {args.agent}")
    return 0

def cmd_start(args):
    t = load_ticket(args.ticket_id)
    if not t:
        return 1
    if t["status"] != "CLAIMED":
        print(f"Ticket não está CLAIMED: {t['status']}")
        return 1
    t["status"] = "IN_PROGRESS"
    save_ticket(t)
    print(f"✓ {args.ticket_id} -> IN_PROGRESS")
    return 0

def cmd_block(args):
    t = load_ticket(args.ticket_id)
    if not t:
        return 1
    t["status"] = "BLOCKED"
    save_ticket(t)
    print(f"✓ {args.ticket_id} -> BLOCKED")
    return 0

def cmd_review(args):
    t = load_ticket(args.ticket_id)
    if not t:
        return 1
    if t["status"] != "IN_PROGRESS":
        print(f"Ticket não está IN_PROGRESS: {t['status']}")
        return 1
    t["status"] = "IN_REVIEW"
    save_ticket(t)
    print(f"✓ {args.ticket_id} -> IN_REVIEW")
    return 0

def cmd_approve(args):
    t = load_ticket(args.ticket_id)
    if not t:
        return 1
    if t["status"] != "IN_REVIEW":
        print(f"Ticket não está IN_REVIEW: {t['status']}")
        return 1
    t["status"] = "APPROVED"
    save_ticket(t)
    print(f"✓ {args.ticket_id} -> APPROVED")
    return 0

def cmd_request_changes(args):
    t = load_ticket(args.ticket_id)
    if not t:
        return 1
    t["status"] = "CHANGES_REQUESTED"
    save_ticket(t)
    print(f"✓ {args.ticket_id} -> CHANGES_REQUESTED")
    return 0

def cmd_integrate(args):
    t = load_ticket(args.ticket_id)
    if not t:
        return 1
    if t["status"] != "APPROVED":
        print(f"Ticket não está APPROVED: {t['status']}")
        return 1
    t["status"] = "INTEGRATING"
    save_ticket(t)
    print(f"✓ {args.ticket_id} -> INTEGRATING")
    return 0

def cmd_done(args):
    t = load_ticket(args.ticket_id)
    if not t:
        return 1
    if t["status"] != "INTEGRATING":
        print(f"Ticket não está INTEGRATING: {t['status']}")
        return 1
    t["status"] = "DONE"
    save_ticket(t)
    lock_path = LOCKS_DIR / f"{args.ticket_id}.lock"
    if lock_path.exists():
        os.remove(lock_path)
    print(f"✓ {args.ticket_id} -> DONE")
    return 0

def cmd_unlock(args):
    tickets = get_all_tickets()
    unlocked = 0
    for t in tickets:
        if t["status"] != "BLOCKED":
            continue
        deps_ok = all(
            load_ticket(d) and load_ticket(d)["status"] in ("DONE", "INTEGRATING", "APPROVED")
            for d in t.get("dependencies", [])
        )
        if deps_ok:
            t["status"] = "READY"
            save_ticket(t)
            unlocked += 1
            print(f"✓ {t['id']} -> READY")
    print(f"{unlocked} tickets desbloqueados")
    return 0

def cmd_conflicts(args):
    tickets = get_all_tickets()
    in_progress = [t for t in tickets if t["status"] in ("CLAIMED", "IN_PROGRESS")]
    conflicts = []
    for i, a in enumerate(in_progress):
        for b in in_progress[i+1:]:
            for wa in a.get("write_paths", []):
                for wb in b.get("write_paths", []):
                    if wa.startswith(wb) or wb.startswith(wa):
                        conflicts.append((a["id"], b["id"], wa, wb))
    if conflicts:
        print("CONFLITOS DETECTADOS:")
        for a, b, wa, wb in conflicts:
            print(f"  {a} <-> {b}: {wa} / {wb}")
    else:
        print("✓ Nenhum conflito de write_paths detectado")
    return 0

def cmd_graph(args):
    print("Dependências (mermaid format):")
    tickets = get_all_tickets()
    for t in tickets:
        for dep in t.get("dependencies", []):
            print(f"  {dep} --> {t['id']}")

def cmd_ownership(args):
    own = {}
    for t in get_all_tickets():
        for wp in t.get("write_paths", []):
            own.setdefault(wp, []).append(t["id"])
    for path, ids in sorted(own.items()):
        if len(ids) > 1:
            print(f"{path}: {', '.join(ids)} (CONFLITO POTENCIAL)")
        else:
            print(f"{path}: {ids[0]}")

def cmd_summary(args):
    tickets = get_all_tickets()
    by_state = {}
    for t in tickets:
        by_state.setdefault(t["status"], 0)
        by_state[t["status"]] += 1
    print("=== RESUMO ===")
    print(f"Total tickets: {len(tickets)}")
    for s in STATES:
        if by_state.get(s, 0):
            print(f"  {s}: {by_state[s]}")
    ready = [t for t in tickets if t["status"] == "READY"]
    print(f"\nProntos para execução: {len(ready)}")

def cmd_regenerate(args):
    tickets = get_all_tickets()
    # Preserva metadados curados (waves, epics) que não derivam dos tickets.
    previous = {}
    if MANIFEST_PATH.exists():
        try:
            with open(MANIFEST_PATH) as f:
                previous = json.load(f)
        except json.JSONDecodeError:
            previous = {}
    waves = {}
    for t in tickets:
        waves.setdefault(str(t.get("wave", 0)), {"name": "", "tickets": []})["tickets"].append(t["id"])
    for key, wave in waves.items():
        wave["name"] = previous.get("waves", {}).get(key, {}).get("name", f"Wave {key}")
    manifest = {
        "version": previous.get("version", "1.0"),
        "generated_at": "2026-08-02T13:30:00Z",
        "total_tickets": len(tickets),
        "waves": waves,
        "epics": previous.get("epics", {}),
        "status_counts": {
            s: sum(1 for t in tickets if t["status"] == s)
            for s in STATES
            if any(t["status"] == s for t in tickets)
        },
        "tickets": [t["id"] for t in tickets],
    }
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"✓ Manifest regenerado: {len(tickets)} tickets")
    return 0

def main():
    parser = argparse.ArgumentParser(description="ticketctl — Gestão de tickets")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("validate")
    sub.add_parser("list")
    p_show = sub.add_parser("show"); p_show.add_argument("ticket_id")
    sub.add_parser("ready")
    p_wave = sub.add_parser("wave"); p_wave.add_argument("--max", type=int)
    p_claim = sub.add_parser("claim"); p_claim.add_argument("ticket_id"); p_claim.add_argument("--agent", required=True)
    p_start = sub.add_parser("start"); p_start.add_argument("ticket_id")
    p_block = sub.add_parser("block"); p_block.add_argument("ticket_id")
    p_review = sub.add_parser("review"); p_review.add_argument("ticket_id")
    p_approve = sub.add_parser("approve"); p_approve.add_argument("ticket_id")
    p_req = sub.add_parser("request-changes"); p_req.add_argument("ticket_id")
    p_int = sub.add_parser("integrate"); p_int.add_argument("ticket_id")
    p_done = sub.add_parser("done"); p_done.add_argument("ticket_id")
    sub.add_parser("unlock")
    sub.add_parser("conflicts")
    sub.add_parser("graph")
    sub.add_parser("ownership")
    sub.add_parser("summary")
    sub.add_parser("regenerate")
    args = parser.parse_args()
    cmds = {
        "validate": cmd_validate, "list": cmd_list, "show": cmd_show,
        "ready": cmd_ready, "wave": cmd_wave, "claim": cmd_claim,
        "start": cmd_start, "block": cmd_block, "review": cmd_review,
        "approve": cmd_approve, "request-changes": cmd_request_changes,
        "integrate": cmd_integrate, "done": cmd_done, "unlock": cmd_unlock,
        "conflicts": cmd_conflicts, "graph": cmd_graph, "ownership": cmd_ownership,
        "summary": cmd_summary, "regenerate": cmd_regenerate
    }
    fn = cmds.get(args.cmd)
    if not fn:
        parser.print_help()
        return 1
    return fn(args) or 0

if __name__ == "__main__":
    sys.exit(main())
