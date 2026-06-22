import os

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

print(f"{'FILE':<45} | {'INSTANCES':<10}")
print("-" * 58)

total_fixed = 0

for filepath in files:
    if not os.path.exists(filepath):
        continue

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    count = content.count('\\${')
    if count > 0:
        new_content = content.replace('\\${', '${')
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"{filepath:<45} | {count:<10}")
        total_fixed += count
    else:
        # Check if the file exists but has no escaped literals
        print(f"{filepath:<45} | 0")

print("-" * 58)
print(f"{'TOTAL':<45} | {total_fixed:<10}")
