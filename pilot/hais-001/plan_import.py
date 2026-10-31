#!/usr/bin/env python3
"""HAIS-001 offline task import planner. Never writes to GitHub or production."""
import argparse
import json
from pathlib import Path
from validate import validate

STATES = {"Pending", "In Progress", "Completed", "Blocked", "Failed"}
PRIORITY = {"identity": "Critical", "platform": "High", "product": "High",
            "quality": "High", "deployment": "High"}


def convert(manifest, existing=None):
    errors = validate(manifest)
    if errors:
        raise ValueError("; ".join(errors))
    existing = existing or {"organizationId": manifest["workspace"], "tasks": []}
    if existing.get("organizationId") != manifest["workspace"]:
        raise ValueError("Cross-workspace import refused")
    old = existing.get("tasks", [])
    if not isinstance(old, list):
        raise ValueError("Invalid existing tasks")
    existing_ids = {str(t.get("pilot_task_id")) for t in old if t.get("pilot_task_id")}
    existing_ids |= {str(t.get("id")) for t in old if str(t.get("id", "")).startswith("HAIS-001-")}
    created = []
    for task in manifest["tasks"]:
        key = "HAIS-001-" + task["id"]
        if key in existing_ids or task["id"] in existing_ids:
            continue
        created.append({
            "id": key, "pilot_task_id": key, "pilot_id": manifest["pilot_id"],
            "organizationId": manifest["workspace"], "repository": manifest["repository"],
            "title": task["title"], "descripcion": task["title"],
            "tema_principal": "HAIS-001 / " + task["lane"],
            "prioridad": PRIORITY[task["lane"]], "estado": "Pending",
            "completitud": 0, "task_type": "chore",
            "resuelto_por": "", "asignados": [], "tags": ["hais-001", task["lane"]],
            "blocked_by": ["HAIS-001-" + d for d in task["deps"]],
            "acceptance_criteria": "\n".join(task["acceptance"]),
            "executor_proposed": task["executor"], "subtasks": [],
            "external_links": [], "comments": [], "change_log": []
        })
    result = dict(existing)
    result["tasks"] = old + created
    result["organizationId"] = manifest["workspace"]
    result.setdefault("schema_version", "1.2.0")
    return result, len(created)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--existing", type=Path, help="Existing tasks.json of HAIS workspace")
    p.add_argument("--output", type=Path, help="Write local import candidate (never upload)")
    args = p.parse_args()
    manifest = json.loads(Path(__file__).with_name("backlog.json").read_text(encoding="utf-8"))
    existing = json.loads(args.existing.read_text(encoding="utf-8")) if args.existing else None
    data, count = convert(manifest, existing)
    print(f"Plan HAIS-001: {count} tasks to add, {len(data['tasks'])} total. No remote writes.")
    if args.output:
        args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Candidate written: {args.output}")


if __name__ == "__main__":
    main()
