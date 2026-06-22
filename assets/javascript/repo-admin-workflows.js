/* ═══════════════════════════════
   WORKFLOWS COPY LOGIC
   ═══════════════════════════════ */
window.copyWorkflows = function(key) {
  const wf = WORKFLOWS[key];
  if (!wf) return;
  navigator.clipboard.writeText(JSON.stringify(wf, null, 2))
    .then(() => log('success', `Copied "${wf.name}" workflow JSON`))
    .catch(() => log('error', 'Clipboard blocked'));
}
