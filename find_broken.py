import os

files = [
    "assets/javascript/repo-admin-api.js", "assets/javascript/repo-admin-ui.js",
    "assets/javascript/repo-admin-svn.js", "assets/javascript/repo-admin-git.js",
    "assets/javascript/repo-admin-workflows.js", "assets/javascript/neural-chat-catalogs.js",
    "assets/javascript/neural-chat-docs.js", "assets/javascript/neural-chat-ui.js",
    "assets/javascript/neural-chat-sessions.js", "assets/javascript/neural-chat-profiles.js",
    "assets/javascript/neural-chat-jules.js", "assets/javascript/neural-chat-send.js",
    "assets/javascript/neural-chat-activity.js", "assets/javascript/jules-panel-ui.js",
    "assets/javascript/jules-panel-repo.js", "assets/javascript/jules-panel-sessions.js",
    "assets/javascript/jules-panel-metrics.js", "assets/javascript/jules-panel-kanban.js",
    "assets/javascript/jules-panel-hub.js", "assets/javascript/jules-panel-neural.js",
    "assets/javascript/jules-panel-auth.js"
]

broken_sequence = b'\\${'

for f in files:
    if not os.path.exists(f):
        continue
    with open(f, 'rb') as fd:
        content = fd.read()

    if broken_sequence in content:
        print(f"BROKEN: {f} (Count: {content.count(broken_sequence)})")
    else:
        # Check if it has ${ at all
        if b'${' in content:
            print(f"CORRECT: {f}")
        else:
            print(f"NONE: {f}")
