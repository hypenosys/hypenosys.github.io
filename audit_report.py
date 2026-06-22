import os
import sys

files = [
    "assets/javascript/repo-admin-api.js",
    "assets/javascript/repo-admin-ui.js",
    "assets/javascript/repo-admin-svn.js",
    "assets/javascript/repo-admin-git.js",
    "assets/javascript/repo-admin-workflows.js",
    "assets/javascript/neural-chat-catalogs.js",
    "assets/javascript/neural-chat-docs.js",
    "assets/javascript/neural-chat-ui.js",
    "assets/javascript/neural-chat-sessions.js",
    "assets/javascript/neural-chat-profiles.js",
    "assets/javascript/neural-chat-jules.js",
    "assets/javascript/neural-chat-send.js",
    "assets/javascript/neural-chat-activity.js",
    "assets/javascript/jules-panel-ui.js",
    "assets/javascript/jules-panel-repo.js",
    "assets/javascript/jules-panel-sessions.js",
    "assets/javascript/jules-panel-metrics.js",
    "assets/javascript/jules-panel-kanban.js",
    "assets/javascript/jules-panel-hub.js",
    "assets/javascript/jules-panel-neural.js",
    "assets/javascript/jules-panel-auth.js"
]

for filepath in files:
    if not os.path.exists(filepath):
        print(f"ERROR: File {filepath} not found.")
        print("---")
        continue

    found = False
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        for i, line in enumerate(lines):
            if '\\${' in line:
                found = True
                lnum = i + 1
                before = line.strip()
                after = line.replace('\\${', '${').strip()
                print(f"FILE: {filepath}")
                print(f"LINE: {lnum}")
                print(f"BEFORE: {before}")
                print(f"AFTER: {after}")
                print("---")

    if not found:
        # Check for non-escaped ones too if needed, but the task is about fixing escaped ones
        # print(f"AUDIT: {filepath} -> No escaped template literals found.")
        # print("---")
        pass
