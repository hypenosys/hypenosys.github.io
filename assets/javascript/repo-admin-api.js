/* ════════════════════════════════════════
   N8N WORKFLOWS — copy from Settings
   ════════════════════════════════════════ */
window.WORKFLOWS = {
  'svn-list': {
    name: "SVN List",
    nodes: [
      {
        parameters: {
          httpMethod: ["POST"], path: "svn-list",
          responseMode: "responseNode",
          options: { allowedOrigins: "https://hypenosys.github.io" }
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
svn_url = f"svn://100.64.74.27/hypenosys/trunk/Hypenosys/{path}".rstrip('/')
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
          options: { allowedOrigins: "https://hypenosys.github.io" }
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
svn_url = f"svn://100.64.74.27/hypenosys/trunk/Hypenosys/{path}".rstrip('/')
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
          options: { allowedOrigins: "https://hypenosys.github.io" }
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
svn_url = 'svn://100.64.74.27/hypenosys/trunk/Hypenosys'
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
          options: { allowedOrigins: "https://hypenosys.github.io" }
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
svn_url = f"svn://100.64.74.27/hypenosys/trunk/Hypenosys/{path}".rstrip('/')
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
  'git-log': {
    name: "Git Log",
    nodes: [
      {
        parameters: {
          httpMethod: ["POST"], path: "git-log",
          responseMode: "responseNode",
          options: { allowedOrigins: "https://hypenosys.github.io" }
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
    const userEl = document.getElementById('cfgSvnUser');
    const passEl = document.getElementById('cfgSvnPass');
    if (userEl) userEl.value = ST.svnUser;
    if (passEl) passEl.value = ST.svnPass;
    if (s.endpoints) {
      Object.keys(s.endpoints).forEach(k => {
        const el = document.getElementById('cfg' + k.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(''));
        if (el) el.value = s.endpoints[k];
      });
    }
  } catch(e) {}
}

window.saveSettings = function() {
  ST.endpoints = {
    'svn-list': document.getElementById('cfgSvnList').value.trim(),
    'svn-log': document.getElementById('cfgSvnLog').value.trim(),
    'svn-info': document.getElementById('cfgSvnInfo').value.trim(),
    'svn-diff': document.getElementById('cfgSvnDiff').value.trim(),
    'git-log': document.getElementById('cfgGitLog').value.trim(),
  };
  ST.svnUser = document.getElementById('cfgSvnUser').value.trim();
  ST.svnPass = document.getElementById('cfgSvnPass').value.trim();
  localStorage.setItem('hypenosys_repoAdmin', JSON.stringify({
    endpoints: ST.endpoints,
    svnUser: ST.svnUser,
    svnPass: ST.svnPass
  }));
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
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, user: ST.svnUser || 'SVN_USERNAME', password: ST.svnPass || 'SVN_PASSWORD' }),
    signal: AbortSignal.timeout(45000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  setStatus('ok', 'OK');
  return data;
}
