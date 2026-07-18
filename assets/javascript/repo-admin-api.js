/* ════════════════════════════════════════
   N8N WORKFLOWS — copy from Settings
   ════════════════════════════════════════ */
// NOTE: This object is a static reference only used for display in the Settings UI and for copying the JSON structure to the clipboard; it is not read via any API call to dynamically create or update workflows in n8n.
window.WORKFLOWS = {
  'svn-list': {
    name: "SVN List",
    nodes: [
      {
        parameters: {
          httpMethod: ["POST"], path: "svn-list",
          responseMode: "responseNode",
          options: { allowedOrigins: "https://hypenosys.github.io,https://hypenosys.com,https://www.hypenosys.com" }
        },
        type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: [400, -200], id: "wh-svn-list", name: "Webhook SVN List"
      },
      {
        parameters: {
          language: "python",
          code: `import subprocess, json
body = items[0]['json']['body']
path = body.get('path', '')
svn_repo = body.get('svnRepo', 'svn://example.com/repo/trunk/Hypenosys')
svn_url = f"{svn_repo}/{path}".rstrip('/')
user = body.get('user', 'SVN_USERNAME')
pwd = body.get('password', 'SVN_PASSWORD')
result = subprocess.run(
  ['svn', 'list', '--xml', '--username', user, '--password', pwd, '--no-auth-cache', '--non-interactive', svn_url],
  capture_output=True, text=True, timeout=30
)
if result.returncode != 0:
  return [{'json': {'error': result.stderr, 'path': path}}]
import xml.etree.ElementTree as ET
root = ET.fromstring(result.stdout)
entries = []
for entry in root.findall('.//entry'):
  name = entry.find('name').text or ''
  kind = entry.get('kind', 'file')
  commit = entry.find('commit')
  rev = commit.get('revision') if commit is not None else ''
  author_el = commit.find('author') if commit is not None else None
  date_el = commit.find('date') if commit is not None else None
  entries.append({
    'name': name, 'kind': kind, 'revision': rev,
    'author': author_el.text if author_el is not None else '',
    'date': date_el.text[:10] if date_el is not None else ''
  })
entries.sort(key=lambda x: (0 if x['kind']=='dir' else 1, x['name']))
return [{'json': {'entries': entries, 'path': path}}]`
        },
        type: "n8n-nodes-base.code", typeVersion: 2,
        position: [600, -200], id: "code-svn-list", name: "SVN List"
      },
      {
        parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: { responseHeaders: { entries: [{ name: "Content-Type", value: "application/json" }] } } },
        type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.4,
        position: [800, -200], id: "resp-svn-list", name: "Respond"
      }
    ],
    connections: {
      "Webhook SVN List": { main: [[{ node: "SVN List", type: "main", index: 0 }]] },
      "SVN List": { main: [[{ node: "Respond", type: "main", index: 0 }]] }
    }
  },
  'svn-log': {
    name: "SVN Log",
    nodes: [
      {
        parameters: {
          httpMethod: ["POST"], path: "svn-log",
          responseMode: "responseNode",
          options: { allowedOrigins: "https://hypenosys.github.io,https://hypenosys.com,https://www.hypenosys.com" }
        },
        type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: [400, -200], id: "wh-svn-log", name: "Webhook SVN Log"
      },
      {
        parameters: {
          language: "python",
          code: `import subprocess, json
body = items[0]['json']['body']
path = body.get('path', '')
limit = int(body.get('limit', 20))
user = body.get('user', 'SVN_USERNAME')
pwd = body.get('password', 'SVN_PASSWORD')
svn_repo = body.get('svnRepo', 'svn://example.com/repo/trunk/Hypenosys')
svn_url = f"{svn_repo}/{path}".rstrip('/')
result = subprocess.run(
  ['svn', 'log', '--xml', '-l', str(limit), '--username', user, '--password', pwd, '--no-auth-cache', '--non-interactive', svn_url],
  capture_output=True, text=True, timeout=30
)
if result.returncode != 0:
  return [{'json': {'error': result.stderr}}]
import xml.etree.ElementTree as ET
root = ET.fromstring(result.stdout)
entries = []
for entry in root.findall('logentry'):
  rev = entry.get('revision')
  author = entry.find('author')
  date = entry.find('date')
  msg = entry.find('msg')
  paths_el = entry.find('paths')
  paths = []
  if paths_el:
    for p in paths_el.findall('path'):
      paths.append({'action': p.get('action',''), 'path': p.text or ''})
  entries.append({
    'revision': rev,
    'author': author.text if author is not None else '',
    'date': date.text[:19].replace('T',' ') if date is not None else '',
    'message': msg.text.strip() if msg is not None and msg.text else '',
    'paths': paths
  })
return [{'json': {'log': entries, 'count': len(entries)}}]`
        },
        type: "n8n-nodes-base.code", typeVersion: 2,
        position: [600, -200], id: "code-svn-log", name: "SVN Log"
      },
      {
        parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: { responseHeaders: { entries: [{ name: "Content-Type", value: "application/json" }] } } },
        type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.4,
        position: [800, -200], id: "resp-svn-log", name: "Respond"
      }
    ],
    connections: {
      "Webhook SVN Log": { main: [[{ node: "SVN Log", type: "main", index: 0 }]] },
      "SVN Log": { main: [[{ node: "Respond", type: "main", index: 0 }]] }
    }
  },
  'svn-info': {
    name: "SVN Info",
    nodes: [
      {
        parameters: {
          httpMethod: ["POST"], path: "svn-info",
          responseMode: "responseNode",
          options: { allowedOrigins: "https://hypenosys.github.io,https://hypenosys.com,https://www.hypenosys.com" }
        },
        type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: [400, -200], id: "wh-svn-info", name: "Webhook SVN Info"
      },
      {
        parameters: {
          language: "python",
          code: `import subprocess
body = items[0]['json']['body']
user = body.get('user', 'SVN_USERNAME')
pwd = body.get('password', 'SVN_PASSWORD')
svn_repo = body.get('svnRepo', 'svn://example.com/repo/trunk/Hypenosys')
svn_url = svn_repo
result = subprocess.run(
  ['svn', 'info', '--xml', '--username', user, '--password', pwd, '--no-auth-cache', '--non-interactive', svn_url],
  capture_output=True, text=True, timeout=15
)
if result.returncode != 0:
  return [{'json': {'error': result.stderr}}]
import xml.etree.ElementTree as ET
root = ET.fromstring(result.stdout)
entry = root.find('.//entry')
info = {}
if entry is not None:
  url_el = entry.find('url')
  rev_el = entry.find('commit')
  wc_root = entry.find('wc-info/wcroot-abspath') if entry.find('wc-info') is not None else None
  info = {
    'revision': entry.get('revision', ''),
    'url': url_el.text if url_el is not None else '',
    'last_changed_rev': rev_el.get('revision') if rev_el is not None else '',
    'last_changed_author': (rev_el.find('author').text if rev_el is not None and rev_el.find('author') is not None else ''),
    'last_changed_date': (rev_el.find('date').text[:19].replace('T',' ') if rev_el is not None and rev_el.find('date') is not None else '')
  }
return [{'json': info}]`
        },
        type: "n8n-nodes-base.code", typeVersion: 2,
        position: [600, -200], id: "code-svn-info", name: "SVN Info"
      },
      {
        parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: { responseHeaders: { entries: [{ name: "Content-Type", value: "application/json" }] } } },
        type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.4,
        position: [800, -200], id: "resp-svn-info", name: "Respond"
      }
    ],
    connections: {
      "Webhook SVN Info": { main: [[{ node: "SVN Info", type: "main", index: 0 }]] },
      "SVN Info": { main: [[{ node: "Respond", type: "main", index: 0 }]] }
    }
  },
  'svn-diff': {
    name: "SVN Diff",
    nodes: [
      {
        parameters: {
          httpMethod: ["POST"], path: "svn-diff",
          responseMode: "responseNode",
          options: { allowedOrigins: "https://hypenosys.github.io,https://hypenosys.com,https://www.hypenosys.com" }
        },
        type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: [400, -200], id: "wh-svn-diff", name: "Webhook SVN Diff"
      },
      {
        parameters: {
          language: "python",
          code: `import subprocess
body = items[0]['json']['body']
path = body.get('path', '')
rev1 = str(body.get('rev1', 'PREV'))
rev2 = str(body.get('rev2', 'HEAD'))
user = body.get('user', 'SVN_USERNAME')
pwd = body.get('password', 'SVN_PASSWORD')
svn_repo = body.get('svnRepo', 'svn://example.com/repo/trunk/Hypenosys')
svn_url = f"{svn_repo}/{path}".rstrip('/')
result = subprocess.run(
  ['svn', 'diff', '-r', f'{rev1}:{rev2}', '--username', user, '--password', pwd, '--no-auth-cache', '--non-interactive', svn_url],
  capture_output=True, text=True, timeout=30
)
return [{'json': {'diff': result.stdout, 'error': result.stderr, 'path': path, 'rev1': rev1, 'rev2': rev2}}]`
        },
        type: "n8n-nodes-base.code", typeVersion: 2,
        position: [600, -200], id: "code-svn-diff", name: "SVN Diff"
      },
      {
        parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: { responseHeaders: { entries: [{ name: "Content-Type", value: "application/json" }] } } },
        type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.4,
        position: [800, -200], id: "resp-svn-diff", name: "Respond"
      }
    ],
    connections: {
      "Webhook SVN Diff": { main: [[{ node: "SVN Diff", type: "main", index: 0 }]] },
      "SVN Diff": { main: [[{ node: "Respond", type: "main", index: 0 }]] }
    }
  },
  'svn-cat': {
    name: "SVN Cat",
    nodes: [
      {
        parameters: {
          httpMethod: ["POST"], path: "svn-cat",
          responseMode: "responseNode",
          options: { allowedOrigins: "https://hypenosys.github.io,https://hypenosys.com,https://www.hypenosys.com" }
        },
        type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: [400, -200], id: "wh-svn-cat", name: "Webhook SVN Cat"
      },
      {
        parameters: {
          language: "python",
          code: `import subprocess
body = items[0]['json']['body']
path = body.get('path', '')
rev = str(body.get('rev', 'HEAD'))
user = body.get('user', 'SVN_USERNAME')
pwd = body.get('password', 'SVN_PASSWORD')
svn_repo = body.get('svnRepo', 'svn://example.com/repo/trunk/Hypenosys')
svn_url = f"{svn_repo}/{path}".rstrip('/')
result = subprocess.run(
  ['svn', 'cat', '-r', rev, '--username', user, '--password', pwd, '--no-auth-cache', '--non-interactive', svn_url],
  capture_output=True, text=True, timeout=30
)
content = result.stdout
truncated = False
if len(content) > 8000:
    content = content[:8000]
    truncated = True
return [{'json': {'content': content, 'truncated': truncated, 'error': result.stderr, 'path': path, 'rev': rev}}]`
        },
        type: "n8n-nodes-base.code", typeVersion: 2,
        position: [600, -200], id: "code-svn-cat", name: "SVN Cat"
      },
      {
        parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: { responseHeaders: { entries: [{ name: "Content-Type", value: "application/json" }] } } },
        type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.4,
        position: [800, -200], id: "resp-svn-cat", name: "Respond"
      }
    ],
    connections: {
      "Webhook SVN Cat": { main: [[{ node: "SVN Cat", type: "main", index: 0 }]] },
      "SVN Cat": { main: [[{ node: "Respond", type: "main", index: 0 }]] }
    }
  },
  'git-log': {
    name: "Git Log",
    nodes: [
      {
        parameters: {
          httpMethod: ["POST"], path: "git-log",
          responseMode: "responseNode",
          options: { allowedOrigins: "https://hypenosys.github.io,https://hypenosys.com,https://www.hypenosys.com" }
        },
        type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: [400, -200], id: "wh-git-log", name: "Webhook Git Log"
      },
      {
        parameters: {
          language: "python",
          code: `import subprocess, json
body = items[0]['json']['body']
limit = int(body.get('limit', 30))
branch = body.get('branch', 'main')
repo_path = body.get('repoPath', '/path/to/hypenosys.github.io')
result = subprocess.run(
  ['git', '-C', repo_path, 'log', branch, f'-{limit}',
   '--pretty=format:%H|%an|%ae|%ad|%s', '--date=short'],
  capture_output=True, text=True, timeout=15
)
if result.returncode != 0:
  return [{'json': {'error': result.stderr}}]
commits = []
for line in result.stdout.strip().split('\\n'):
  if not line: continue
  parts = line.split('|', 4)
  if len(parts) == 5:
    commits.append({'hash': parts[0][:8], 'fullHash': parts[0], 'author': parts[1], 'email': parts[2], 'date': parts[3], 'message': parts[4]})
return [{'json': {'commits': commits, 'count': len(commits), 'branch': branch}}]`
        },
        type: "n8n-nodes-base.code", typeVersion: 2,
        position: [600, -200], id: "code-git-log", name: "Git Log"
      },
      {
        parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: { responseHeaders: { entries: [{ name: "Content-Type", value: "application/json" }] } } },
        type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.4,
        position: [800, -200], id: "resp-git-log", name: "Respond"
      }
    ],
    connections: {
      "Webhook Git Log": { main: [[{ node: "Git Log", type: "main", index: 0 }]] },
      "Git Log": { main: [[{ node: "Respond", type: "main", index: 0 }]] }
    }
  },
  'python-runner': {
    name: "Python Runner",
    nodes: [
      {
        parameters: {
          httpMethod: ["POST"], path: "python-runner",
          responseMode: "responseNode",
          options: { allowedOrigins: "https://hypenosys.github.io,https://hypenosys.com,https://www.hypenosys.com" }
        },
        type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: [400, -200], id: "wh-python-runner", name: "Webhook Python Runner"
      },
      {
        parameters: {
          language: "python",
          code: `import subprocess, os, tempfile, json

body = items[0]['json']['body']
code = body.get('code', '')
args = body.get('args', [])
stdin_input = body.get('stdin', '')

if not code:
    return [{'json': {'error': 'No code provided', 'exitCode': 1}}]

# Create a temporary file for the script
with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as tmp:
    tmp.write(code.encode('utf-8'))
    tmp_path = tmp.name

try:
    # Prepare Docker command
    # --rm: remove container after run
    # --network none: no internet access
    # --memory=128m: limit RAM
    # --cpus=0.5: limit CPU
    # --read-only: filesystem is read-only
    # --tmpfs /tmp: allow writing to /tmp
    # -v {tmp_path}:/app/script.py:ro : mount script as read-only

    cmd = [
        'timeout', '10s',
        'docker', 'run', '--rm', '--network', 'none',
        '--memory=128m', '--cpus=0.5',
        '--read-only', '--tmpfs', '/tmp',
        '-v', f'{tmp_path}:/app/script.py:ro',
        'python:3.10-slim',
        'python', '/app/script.py'
    ]

    if args:
        if isinstance(args, str):
            import shlex
            cmd.extend(shlex.split(args))
        elif isinstance(args, list):
            cmd.extend([str(a) for a in args])

    # Execute
    process = subprocess.run(
        cmd,
        input=stdin_input,
        capture_output=True,
        text=True,
        timeout=12 # slightly more than the timeout command
    )

    stdout = process.stdout
    stderr = process.stderr
    exit_code = process.returncode

    truncated = False
    if len(stdout) > 4000:
        stdout = stdout[:4000] + "\\n[STDOUT TRUNCATED]"
        truncated = True
    if len(stderr) > 4000:
        stderr = stderr[:4000] + "\\n[STDERR TRUNCATED]"
        truncated = True

    return [{'json': {
        'stdout': stdout,
        'stderr': stderr,
        'exitCode': exit_code,
        'truncated': truncated,
        'timedOut': exit_code == 124 # timeout command exit code
    }}]

except subprocess.TimeoutExpired:
    return [{'json': {'error': 'Execution timed out', 'timedOut': True, 'exitCode': 124}}]
except Exception as e:
    return [{'json': {'error': str(e), 'exitCode': 1}}]
finally:
    if os.path.exists(tmp_path):
        os.remove(tmp_path)`
        },
        type: "n8n-nodes-base.code", typeVersion: 2,
        position: [600, -200], id: "code-python-runner", name: "Python Runner"
      },
      {
        parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: { responseHeaders: { entries: [{ name: "Content-Type", value: "application/json" }] } } },
        type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.4,
        position: [800, -200], id: "resp-python-runner", name: "Respond"
      }
    ],
    connections: {
      "Webhook Python Runner": { main: [[{ node: "Python Runner", type: "main", index: 0 }]] },
      "Python Runner": { main: [[{ node: "Respond", type: "main", index: 0 }]] }
    }
  },
  'javascript-runner': {
    name: "Javascript Runner",
    nodes: [
      {
        parameters: {
          httpMethod: ["POST"], path: "javascript-runner",
          responseMode: "responseNode",
          options: { allowedOrigins: "https://hypenosys.github.io,https://hypenosys.com,https://www.hypenosys.com" }
        },
        type: "n8n-nodes-base.webhook", typeVersion: 2.1,
        position: [400, -200], id: "wh-javascript-runner", name: "Webhook Javascript Runner"
      },
      {
        parameters: {
          language: "python",
          code: `import subprocess, os, tempfile, json

body = items[0]['json']['body']
code = body.get('code', '')
args = body.get('args', [])
stdin_input = body.get('stdin', '')

if not code:
    return [{'json': {'error': 'No code provided', 'exitCode': 1}}]

# Create a temporary file for the script
with tempfile.NamedTemporaryFile(suffix='.js', delete=False) as tmp:
    tmp.write(code.encode('utf-8'))
    tmp_path = tmp.name

try:
    # Prepare Docker command
    cmd = [
        'timeout', '10s',
        'docker', 'run', '--rm', '--network', 'none',
        '--memory=128m', '--cpus=0.5',
        '--read-only', '--tmpfs', '/tmp',
        '-v', f'{tmp_path}:/app/script.js:ro',
        'node:18-slim',
        'node', '/app/script.js'
    ]

    if args:
        if isinstance(args, str):
            import shlex
            cmd.extend(shlex.split(args))
        elif isinstance(args, list):
            cmd.extend([str(a) for a in args])

    # Execute
    process = subprocess.run(
        cmd,
        input=stdin_input,
        capture_output=True,
        text=True,
        timeout=12
    )

    stdout = process.stdout
    stderr = process.stderr
    exit_code = process.returncode

    truncated = False
    if len(stdout) > 4000:
        stdout = stdout[:4000] + "\\n[STDOUT TRUNCATED]"
        truncated = True
    if len(stderr) > 4000:
        stderr = stderr[:4000] + "\\n[STDERR TRUNCATED]"
        truncated = True

    return [{'json': {
        'stdout': stdout,
        'stderr': stderr,
        'exitCode': exit_code,
        'truncated': truncated,
        'timedOut': exit_code == 124
    }}]

except subprocess.TimeoutExpired:
    return [{'json': {'error': 'Execution timed out', 'timedOut': True, 'exitCode': 124}}]
except Exception as e:
    return [{'json': {'error': str(e), 'exitCode': 1}}]
finally:
    if os.path.exists(tmp_path):
        os.remove(tmp_path)`
        },
        type: "n8n-nodes-base.code", typeVersion: 2,
        position: [600, -200], id: "code-javascript-runner", name: "Javascript Runner"
      },
      {
        parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: { responseHeaders: { entries: [{ name: "Content-Type", value: "application/json" }] } } },
        type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.4,
        position: [800, -200], id: "resp-javascript-runner", name: "Respond"
      }
    ],
    connections: {
      "Webhook Javascript Runner": { main: [[{ node: "Javascript Runner", type: "main", index: 0 }]] },
      "Javascript Runner": { main: [[{ node: "Respond", type: "main", index: 0 }]] }
    }
  }
};

/* ═══════════════════════════════
   STATE
   ═══════════════════════════════ */
window.ST = {
  endpoints: {},
  svnUser: '',
  svnPass: '',
  currentPath: '',
  selectedFile: null,
  consoleCollapsed: false
};

window.currentPath = '';

/* ═══════════════════════════════
   LOAD/SAVE SETTINGS
   ═══════════════════════════════ */
window.loadSettings = function() {
  try {
    const s = JSON.parse(localStorage.getItem('hypenosys_repoAdmin') || '{}');
    ST.endpoints = s.endpoints || {};
    ST.svnUser = s.svnUser || '';
    ST.svnPass = s.svnPass || '';
    ST.svnUrl = s.svnUrl || 'svn://example.com/repo';
    ST.svnRepo = s.svnRepo || 'svn://example.com/repo/trunk/Hypenosys';
    const userEl = document.getElementById('cfgSvnUser');
    const passEl = document.getElementById('cfgSvnPass');
    const urlEl = document.getElementById('cfgSvnUrl');
    const repoEl = document.getElementById('cfgSvnRepo');
    const runnerEl = document.getElementById('cfgPythonRunner');
    const jsRunnerEl = document.getElementById('cfgJavascriptRunner');
    const n8nBaseEl = document.getElementById('cfgN8nBase');
    if (userEl) userEl.value = ST.svnUser;
    if (passEl) passEl.value = ST.svnPass;
    if (urlEl) urlEl.value = ST.svnUrl;
    if (repoEl) repoEl.value = ST.svnRepo;
    if (runnerEl && ST.endpoints['python-runner']) runnerEl.value = ST.endpoints['python-runner'];
    if (jsRunnerEl && ST.endpoints['javascript-runner']) jsRunnerEl.value = ST.endpoints['javascript-runner'];
    if (n8nBaseEl && ST.endpoints['n8n-base']) n8nBaseEl.value = ST.endpoints['n8n-base'];
    if (s.endpoints) {
      Object.keys(s.endpoints).forEach(k => {
        const el = document.getElementById('cfg' + k.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(''));
        if (el) el.value = s.endpoints[k];
      });
    }
    const statRepoEl = document.getElementById('statRepo');
    if (statRepoEl) statRepoEl.textContent = ST.svnRepo;
  } catch(e) {}
}

window.saveSettings = function() {
  ST.endpoints = {
    'svn-list': document.getElementById('cfgSvnList').value.trim(),
    'svn-log': document.getElementById('cfgSvnLog').value.trim(),
    'svn-info': document.getElementById('cfgSvnInfo').value.trim(),
    'svn-diff': document.getElementById('cfgSvnDiff').value.trim(),
    'svn-cat': document.getElementById('cfgSvnCat')?.value.trim() || ST.endpoints['svn-cat'] || '',
    'git-log': document.getElementById('cfgGitLog').value.trim(),
    'python-runner': document.getElementById('cfgPythonRunner')?.value.trim() || ST.endpoints['python-runner'] || '',
    'javascript-runner': document.getElementById('cfgJavascriptRunner')?.value.trim() || ST.endpoints['javascript-runner'] || '',
    'n8n-base': document.getElementById('cfgN8nBase')?.value.trim() || ST.endpoints['n8n-base'] || '',
  };
  ST.svnUser = document.getElementById('cfgSvnUser').value.trim();
  ST.svnPass = document.getElementById('cfgSvnPass').value.trim();
  ST.svnUrl = document.getElementById('cfgSvnUrl')?.value.trim() || 'svn://example.com/repo';
  ST.svnRepo = document.getElementById('cfgSvnRepo')?.value.trim() || 'svn://example.com/repo/trunk/Hypenosys';
  localStorage.setItem('hypenosys_repoAdmin', JSON.stringify({
    endpoints: ST.endpoints,
    svnUser: ST.svnUser,
    svnPass: ST.svnPass,
    svnUrl: ST.svnUrl,
    svnRepo: ST.svnRepo
  }));
  const statRepoEl = document.getElementById('statRepo');
  if (statRepoEl) statRepoEl.textContent = ST.svnRepo;
  toggleSettings();
  log('success', 'Settings saved');
}

/* ═══════════════════════════════
   API CALL
   ═══════════════════════════════ */
window.apiCall = async function(endpointKey, body) {
  const url = ST.endpoints[endpointKey];
  if (!url) {
    log('error', `Endpoint "${endpointKey}" not configured. Open Settings.`);
    toggleSettings();
    throw new Error('Endpoint not configured');
  }
  setStatus('loading', 'Loading...');
  log('cmd', `POST ${endpointKey} ${JSON.stringify(body)}`);
  const res = await window.hypenosysFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      svnUrl: ST.svnUrl || 'svn://example.com/repo',
      svnRepo: ST.svnRepo || 'svn://example.com/repo/trunk/Hypenosys',
      user: ST.svnUser || 'SVN_USERNAME',
      password: ST.svnPass || 'SVN_PASSWORD'
    }),
    signal: AbortSignal.timeout(45000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  setStatus('ok', 'OK');
  return data;
}
