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

results = []

for filepath in files:
    if not os.path.exists(filepath):
        results.append((filepath, "NOT FOUND"))
        continue

    with open(filepath, 'rb') as f:
        content = f.read()

    count = content.count(b'\\${')
    if count > 0:
        new_content = content.replace(b'\\${', b'${')
        with open(filepath, 'wb') as f:
            f.write(new_content)
        results.append((filepath, count))
    else:
        results.append((filepath, 0))

print(f"{'FILE':<45} | {'INSTANCES':<10}")
print("-" * 58)
for f, c in results:
    print(f"{f:<45} | {c:<10}")
