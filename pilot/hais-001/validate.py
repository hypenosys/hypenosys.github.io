#!/usr/bin/env python3
"""Validate the HAIS pilot backlog without external dependencies."""
import json
import sys
from pathlib import Path

ALLOWED_EXECUTORS = {"human", "jules", "cognito"}
ALLOWED_LANES = {"identity", "platform", "product", "quality", "deployment"}


def validate(data):
    errors = []
    if data.get("mode") != "PAPER" or data.get("live_trading_enabled") is not False:
        errors.append("Pilot must be PAPER with LIVE explicitly disabled")
    budget = data.get("budget_eur", {})
    if not (isinstance(budget.get("target"), (int, float))
            and isinstance(budget.get("absolute_ceiling"), (int, float))
            and 0 < budget["target"] <= budget["absolute_ceiling"]):
        errors.append("Budget target and ceiling must be valid positive numbers")
    tasks = data.get("tasks", [])
    if not isinstance(tasks, list) or not tasks:
        return errors + ["Tasks must be a nonempty list"]
    ids = [task.get("id") for task in tasks]
    if len(set(ids)) != len(ids) or any(not isinstance(i, str) or not i for i in ids):
        errors.append("Task IDs must be unique nonempty strings")
    id_set = set(ids)
    graph = {}
    for task in tasks:
        ident = task.get("id")
        deps = task.get("deps")
        if task.get("executor") not in ALLOWED_EXECUTORS:
            errors.append(f"{ident}: unknown executor")
        if task.get("lane") not in ALLOWED_LANES:
            errors.append(f"{ident}: unknown lane")
        if not isinstance(task.get("title"), str) or not task["title"].strip():
            errors.append(f"{ident}: missing title")
        if not isinstance(task.get("acceptance"), list) or not task["acceptance"]:
            errors.append(f"{ident}: missing acceptance criteria")
        if not isinstance(deps, list):
            errors.append(f"{ident}: deps must be a list")
            deps = []
        if len(set(deps)) != len(deps):
            errors.append(f"{ident}: duplicate dependencies")
        if ident in deps:
            errors.append(f"{ident}: self dependency")
        for dep in deps:
            if dep not in id_set:
                errors.append(f"{ident}: missing dependency {dep}")
        graph[ident] = [d for d in deps if d in id_set]
    visiting, visited = set(), set()

    def walk(node):
        if node in visiting:
            errors.append(f"Cycle detected involving {node}")
            return
        if node in visited:
            return
        visiting.add(node)
        for dep in graph.get(node, []):
            walk(dep)
        visiting.remove(node)
        visited.add(node)

    for ident in graph:
        walk(ident)
    return errors


def main():
    path = Path(__file__).with_name("backlog.json")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Failed to read backlog: {exc}", file=sys.stderr)
        return 1
    errors = validate(data)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"HAIS pilot backlog valid: {len(data['tasks'])} tasks, PAPER-only")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
