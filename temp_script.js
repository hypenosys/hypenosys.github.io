1482:<script>
1483-    window.JulesPanelState = {
1484-        activeRepo:          localStorage.getItem('hypenosys_active_repo') || null,
1485-        activeBranch:        localStorage.getItem('hypenosys_active_branch') || null,
1486-        activeSession:       null,
1487-        pollingTimer:        null,
1488-        hubActiveTab:        localStorage.getItem('hypenosys_hub_active_tab') || 'pull-requests',
1489-        rateLimitRemaining:  999,
1490-        requestQueue:        [],
1491-        isDispatching:       false,
1492-        currentView:         'dashboard',
1493-        metricsWindow:       30
1494-        notifications:       [],
1495-        unreadCount:         0
1496-    };
1497-
1498-    class GHAPIQueue {
1499-        constructor() {
1500-            this.queue = [];
1501-            this.running = false;
1502-            this.minInterval = 300;
1503-        }
1504-
1505-        enqueue(fn, priority = 1) {
1506-            return new Promise((resolve, reject) => {
1507-                this.queue.push({ fn, priority, resolve, reject });
1508-                this.queue.sort((a, b) => a.priority - b.priority);
1509-                this.dispatch();
1510-            });
1511-        }
1512-
1513-        async dispatch() {
1514-            if (this.running) return;
1515-            if (!this.queue.length) return;
1516-
1517-            if (window.JulesPanelState.rateLimitRemaining <= 5) {
1518-                const next = this.queue[0];
1519-                if (next.priority > 0) return;
1520-            }
1521-
1522-            this.running = true;
1523-            const { fn, resolve, reject } = this.queue.shift();
1524-            try {
1525-                const result = await fn();
1526-                resolve(result);
1527-            } catch(e) {
1528-                reject(e);
1529-            }
1530-            this.running = false;
1531-            setTimeout(() => this.dispatch(), this.minInterval);
1532-        }
1533-    }
1534-
1535-    window.GHQueue = new GHAPIQueue();
1536-
1537-    function getGitHubToken() {
1538-        if (window.githubContext && window.githubContext.getAuthToken) {
1539-            return window.githubContext.getAuthToken();
1540-        }
1541-        return sessionStorage.getItem('gh_access_token')
1542-            || localStorage.getItem('gh_access_token')
1543-            || localStorage.getItem('github_token')
1544-            || null;
1545-    }
1546-
1547-    function updateRateLimit(remaining) {
1548-        if (remaining === null || remaining === undefined) return;
1549-        const count = parseInt(remaining, 10);
1550-        window.JulesPanelState.rateLimitRemaining = count;
1551-
1552-        if (count <= 10 && count > 0) {
1553-            showToast(`⚠️ GitHub API: ${count} peticiones restantes`, 'amber');
1554-        } else if (count === 0) {
1555-            showToast(`🚫 GitHub API: Rate limit alcanzado`, 'red');
1556-        }
1557-        window.dispatchEvent(new CustomEvent('ghRateLimitUpdate', { detail: { remaining: count } }));
1558-    }
1559-
1560-    function escapeHtml(str) {
1561-      return String(str ?? '')
1562-        .replace(/&/g,'&amp;')
1563-        .replace(/</g,'&lt;')
1564-        .replace(/>/g,'&gt;')
1565-        .replace(/"/g,'&quot;');
1566-    }
1567-
1568-    function getTimeAgo(dateStr) {
1569-        if (!dateStr) return '---;
1570-        const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
1571-        let interval = seconds / 31536000;
1572-        if (interval > 1) return `hace ${Math.floor(interval)} años`;
1573-        interval = seconds / 2592000;
1574-        if (interval > 1) return `hace ${Math.floor(interval)} meses`;
1575-        interval = seconds / 86400;
1576-        if (interval > 1) return `hace ${Math.floor(interval)} días`;
1577-        interval = seconds / 3600;
1578-        if (interval > 1) return `hace ${Math.floor(interval)} horas`;
1579-        interval = seconds / 60;
1580-        if (interval > 1) return `hace ${Math.floor(interval)} min`;
1581-        return 'hace unos segundos';
1582-    }
1583-/* ─── STATE ─── */
1584-
1585-/* ─── HELPERS ─── */
1586-function $(id){return document.getElementById(id)}
1587-
1588-function showToast(msg,type='green'){
1589-  const t=document.createElement('div');
1590-  t.className='toast';t.style.borderColor=`var(--${type})`;
1591-  t.innerHTML=`<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>${msg}</span>`;
1592-  $('toast-wrap').appendChild(t);
1593-  requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add('show')));
1594-  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300)},3200);
1595-}
1596-
1597-/* ─── NOTIFICATIONS ─── */
1598-function pushNotif(title,msg,type='info'){
1599-  const d=new Date();
1600-  const ts=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
1601-  const icons={success:'✅',error:'❌',info:'ℹ️',warn:'⚠️'};
1602-  window.JulesPanelState.notifications.unshift({title,msg,type,ts,unread:true});
1603-  window.JulesPanelState.unreadCount++;
1604-  updateNotifPip();
1605-  renderNotifList();
1606-}
1607-
1608-function updateNotifPip(){
1609-  const pips=[$('notif-pip'),$('mob-notif-pip')];
1610-  pips.forEach(p=>{
1611-    if(!p) return;
1612-    if(window.JulesPanelState.unreadCount>0){
1613-      p.textContent=window.JulesPanelState.unreadCount>9?'9+':window.JulesPanelState.unreadCount;
1614-      p.classList.remove('hidden');
1615-    } else {
1616-      p.classList.add('hidden');
1617-    }
1618-  });
1619-}
1620-
1621-function renderNotifList(){
1622-  const list=$('notif-list');
1623-  if(!window.JulesPanelState.notifications.length){
1624-    list.innerHTML='<div class="notif-empty">Sin notificaciones nuevas</div>';
1625-    return;
1626-  }
1627-  const icons={success:'✅',error:'❌',info:'💡',warn:'⚠️'};
1628-  list.innerHTML=window.JulesPanelState.notifications.slice(0,12).map((n,i)=>`
1629-    <div class="notif-item ${n.unread?'unread':''}" style="position:relative" onclick="markNotifRead(${i})">
1630-      <div class="notif-icon ${n.type}">${icons[n.type]||'💡'}</div>
1631-      <div class="notif-content">
1632-        <div class="notif-title">${n.title}</div>
1633-        <div class="notif-msg">${n.msg}</div>
1634-        <div class="notif-time">${n.ts}</div>
1635-      </div>
1636-    </div>`).join('');
1637-}
1638-
1639-function markNotifRead(i){
1640-  if(window.JulesPanelState.notifications[i]&&window.JulesPanelState.notifications[i].unread){
1641-    window.JulesPanelState.notifications[i].unread=false;
1642-    window.JulesPanelState.unreadCount=Math.max(0,window.JulesPanelState.unreadCount-1);
1643-    updateNotifPip();
1644-    renderNotifList();
1645-  }
1646-}
1647-
1648-function clearNotifs(){
1649-  window.JulesPanelState.notifications=[];window.JulesPanelState.unreadCount=0;
1650-  updateNotifPip();renderNotifList();
1651-}
1652-
1653-function toggleNotifPanel(){
1654-  const p=$('notif-panel');
1655-  const isOpen=p.classList.contains('open');
1656-  p.classList.toggle('open',!isOpen);
1657-  // Mark all as read when opening
1658-  if(!isOpen){
1659-    window.JulesPanelState.notifications.forEach(n=>n.unread=false);
1660-    window.JulesPanelState.unreadCount=0;
1661-    updateNotifPip();
1662-    renderNotifList();
1663-  }
1664-}
1665-
1666-// Close notif panel on outside click
1667-document.addEventListener('click',e=>{
1668-  const panel=$('notif-panel');
1669-  const bell=$('notif-bell');
1670-  const mobBell=$('mob-notif-bell');
1671-  if(panel&&!panel.contains(e.target)&&e.target!==bell&&!bell.contains(e.target)&&e.target!==mobBell&&!(mobBell&&mobBell.contains(e.target))){
1672-    panel.classList.remove('open');
1673-  }
1674-});
1675-
1676-/* ─── TELEMETRY ─── */
1677-function addTel(tag,msg,type='info'){
1678-  const d=new Date();
1679-  const ts=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
1680-  const box=$('tel-box');
1681-  const line=document.createElement('div');
1682-  line.className=`tel-line ${type}`;
1683-  line.innerHTML=`<div class="tel-head"><span class="tel-time">${ts}</span><span class="tel-tag ${type}">${tag}</span></div><div class="tel-msg">${msg}</div>`;
1684-  box.appendChild(line);
1685-  box.scrollTop=box.scrollHeight;
1686-}
1687-
1688-/* ─── VIEW SWITCHER ─── */
1689-function switchView(view, navEl){
1690-  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
1691-  document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
1692-  $(`view-${view}`).classList.add('active');
1693-  if(navEl) navEl.classList.add('active');
1694-  if(view==='kanban') renderKanban();
1695-  if(view==='metrics') renderMetrics();
1696-}
1697-
1698-/* ─── DRAWER TABS ─── */
1699-function switchDrawerTab(tab, el){
1700-  document.querySelectorAll('.dr-tab').forEach(t=>t.classList.remove('active'));
1701-  document.querySelectorAll('.dr-panel').forEach(p=>p.classList.remove('active'));
1702-  el.classList.add('active');
1703-  $(`dr-panel-${tab}`).classList.add('active');
1704-}
1705-
1706-/* ─── RENDER REPOS ─── */
1707-function renderRepos(){
1708-  const list=$('repo-list');list.innerHTML='';
1709-  Object.keys(S.repos).forEach(k=>{
1710-    const r=S.repos[k];
1711-    const el=document.createElement('div');
1712-    el.className=`repo-item ${k===window.JulesPanelState.activeRepo?'selected':''} ${r.status}`;
1713-    el.innerHTML=`<span class="repo-dot"></span><span>${r.name||k}</span>${r.activity[7]>60?'<span class="repo-star">★</span>':''}`;
1714-    el.onclick=()=>switchRepo(k);
1715-    list.appendChild(el);
1716-  });
1717-}
1718-
1719-/* ─── CONTEXT UPDATE ─── */
1720-function updateContext(){
1721-  const r=S.repos[window.JulesPanelState.activeRepo];
1722-  const branch=r.active.split(' ')[0];
1723-  $('hdr-ctx').textContent=`${window.JulesPanelState.activeRepo} / ${branch}`;
1724-  $('cfg-path').textContent=r.path;
1725-  $('alias-in').value=window.JulesPanelState.activeRepo;
1726-  const sel=$('branch-sel');sel.innerHTML='';
1727-  r.branches.forEach(b=>{
1728-    const o=document.createElement('option');
1729-    o.value=b;o.textContent=b;
1730-    if(b===r.active) o.selected=true;
1731-    sel.appendChild(o);
1732-  });
1733-  $('branch-meta').innerHTML=`<span class="u-dot"></span><span>${r.branches.length} ramas cargadas</span>`;
1734-  $('sess-ctx').textContent=`${window.JulesPanelState.activeRepo}: ${branch}`;
1735-  updateChart(r.activity);updateStats();
1736-}
1737-
1738-function updateChart(pts){
1739-  const mx=Math.max(...pts),mn=Math.min(...pts),rng=mx-mn||10;
1740-  let d='';
1741-  pts.forEach((v,i)=>{
1742-    const x=i*(200/(pts.length-1));
1743-    const y=50-((v-mn)/rng)*40;
1744-    d+=i===0?`M ${x} ${y} `:`L ${x} ${y} `;
1745-  });
1746-  $('repo-chart').querySelector('path').setAttribute('d',d);
1747-}
1748-
1749-function updateStats(){
1750-  const r=S.repos[window.JulesPanelState.activeRepo];
1751-  $('s-active').textContent=S.sessions.filter(s=>s.status==='running').length;
1752-  $('s-repos').textContent=Object.keys(S.repos).length;
1753-  $('s-total').textContent=S.sessions.length;
1754-  $('s-branches').textContent=r.branches.length;
1755-  $('kanban-badge').textContent=S.sessions.filter(s=>s.status==='running').length;
1756-}
1757-
1758-function switchRepo(k){
1759-  window.JulesPanelState.activeRepo=k;renderRepos();updateContext();
1760-  addTel("SYSTEM",`Repositorio activo: ${k}`,"info");showToast(`Contexto → ${k}`);
1761-  closeMobileSidebar();
1762-}
1763-
1764-/* ─── TABLE ─── */
1765-function renderTable(){
1766-  const body=$('tbl-body');body.innerHTML='';
1767-  const filtered=S.sessions.filter(s=>{
1768-    if(S.filter.status!=='all'&&s.status!==S.filter.status) return false;
1769-    if(S.filter.search){
1770-      const q=S.filter.search.toLowerCase();
1771-      return s.task.toLowerCase().includes(q)||s.id.includes(q)||s.repo.toLowerCase().includes(q);
1772-    }
1773-    return true;
1774-  });
1775-  if(!filtered.length){
1776-    body.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:28px">No hay sesiones con estos filtros.</td></tr>`;
1777-    return;
1778-  }
1779-  filtered.forEach(s=>{
1780-    const nm={running:'activo',done:'listo',error:'error',pending:'cola'}[s.status]||'listo';
1781-    const tr=document.createElement('tr');
1782-    tr.onclick=()=>openDrawer(s.id);
1783-    tr.innerHTML=`<td><span class="sid">${s.id}</span></td><td class="tdesc">${s.task}</td><td class="tmono">${s.repo}</td><td class="tmono">${s.branch}</td><td><span class="sbadge ${s.status}"><span class="pulse-dot"></span>${nm}</span></td><td class="tmono">${s.duration}</td><td class="tmono">${s.date}</td>`;
1784-    body.appendChild(tr);
1785-  });
1786-}
1787-
1788-/* ─── KANBAN DRAG & DROP ─── */
1789-function renderKanban(){
1790-  ['pending','running','done','error'].forEach(status=>{
1791-    const col=$(`kb-${status}`);col.innerHTML='';
1792-    const items=S.sessions.filter(s=>s.status===status);
1793-    $(`kb-count-${status}`).textContent=items.length;
1794-    items.forEach(s=>{
1795-      const card=document.createElement('div');
1796-      card.className=`kb-card ${status}`;
1797-      card.draggable=true;
1798-      card.dataset.id=s.id;
1799-      card.innerHTML=`
1800-        <div class="kb-card-id">${s.id}</div>
1801-        <div class="kb-card-task">${s.task}</div>
1802-        <div class="kb-card-meta">
1803-          <span class="kb-card-repo">${s.repo}/${s.branch}</span>
1804-          <span class="kb-card-time">${s.duration}</span>
1805-        </div>
1806-        <div class="kb-card-actions">
1807-          <div class="kb-action-btn" onclick="event.stopPropagation();openDrawer('${s.id}')">Terminal</div>
1808-          <div class="kb-action-btn" onclick="event.stopPropagation();openDrawer('${s.id}');setTimeout(()=>switchDrawerTab('diff',document.querySelectorAll('.dr-tab')[1]),100)">Diff</div>
1809-          <div class="kb-action-btn danger" onclick="event.stopPropagation();deleteTask('${s.id}')">Eliminar</div>
1810-        </div>`;
1811-      card.addEventListener('dragstart',e=>{
1812-        S.draggedId=s.id;
1813-        card.classList.add('dragging');
1814-        e.dataTransfer.effectAllowed='move';
1815-      });
1816-      card.addEventListener('dragend',()=>card.classList.remove('dragging'));
1817-      card.addEventListener('click',()=>openDrawer(s.id));
1818-      col.appendChild(card);
1819-    });
1820-  });
1821-}
1822-
1823-function onDragOver(e,status){
1824-  e.preventDefault();e.dataTransfer.dropEffect='move';
1825-  $(`col-${status}`).classList.add('drag-over');
1826-}
1827-function onDragLeave(e){
1828-  const col=e.currentTarget;
1829-  if(!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
1830-}
1831-function onDrop(e,status){
1832-  e.preventDefault();
1833-  const col=e.currentTarget;col.classList.remove('drag-over');
1834-  if(!S.draggedId) return;
1835-  const sess=S.sessions.find(s=>s.id===S.draggedId);
1836-  if(sess&&sess.status!==status){
1837-    const old=sess.status;
1838-    sess.status=status;
1839-    renderKanban();renderTable();updateStats();
1840-    addTel("KANBAN",`${sess.id}: ${old} → ${status}`,"info");
1841-    showToast(`${sess.id} movida a ${status}`);
1842-    pushNotif('Tarea movida',`${sess.id} ahora está en "${status}"`,status==='done'?'success':'info');
1843-  }
1844-  S.draggedId=null;
1845-}
1846-
1847-function deleteTask(id){
1848-  if(!confirm(`¿Eliminar tarea ${id}?`)) return;
1849-  S.sessions=S.sessions.filter(s=>s.id!==id);
1850-  renderKanban();renderTable();updateStats();
1851-  showToast(`Tarea ${id} eliminada`,'amber');
1852-}
1853-
1854-/* ─── NEW TASK MODAL ─── */
1855-let _ntDefaultStatus='pending';
1856-function openNewTaskModal(status='pending'){
1857-  _ntDefaultStatus=status;S.newTaskStatus=status;
1858-  document.querySelectorAll('#nt-status-btns .fpill').forEach(b=>{
1859-    b.classList.toggle('active',b.dataset.st===status);
1860-  });
1861-  $('nt-desc').value='';
1862-  $('new-task-modal').classList.add('open');
1863-  setTimeout(()=>$('nt-desc').focus(),100);
1864-}
1865-function closeNewTaskModal(){$('new-task-modal').classList.remove('open')}
1866-function selectTaskStatus(el){
1867-  document.querySelectorAll('#nt-status-btns .fpill').forEach(b=>b.classList.remove('active'));
1868-  el.classList.add('active');S.newTaskStatus=el.dataset.st;
1869-}
1870-function confirmNewTask(){
1871-  const txt=$('nt-desc').value.trim();
1872-  if(!txt){showToast('Describe la tarea','red');return;}
1873-  const id=`#js-0${S.sessions.length+43}`;
1874-  const branch=S.repos[window.JulesPanelState.activeRepo].active.split(' ')[0];
1875-  S.sessions.unshift({id,task:txt,repo:window.JulesPanelState.activeRepo,branch,status:S.newTaskStatus,duration:'0s',date:'ahora',tokens:0,logs:[`[SYSTEM] Tarea creada manualmente.`],diff:[]});
1876-  closeNewTaskModal();
1877-  renderKanban();renderTable();updateStats();
1878-  showToast(`Tarea ${id} creada`);
1879-  pushNotif('Nueva tarea creada',`${id}: ${txt.slice(0,50)}...`,'info');
1880-}
1881-
1882-/* ─── METRICS ─── */
1883-function renderMetrics(){
1884-  const statuses=['done','running','error','pending'];
1885-  const counts={};
1886-  statuses.forEach(s=>counts[s]=S.sessions.filter(x=>x.status===s).length);
1887-  const total=S.sessions.length||1;
1888-
1889-  // Summary
1890-  const doneCount=counts['done'];
1891-  $('m-success-rate').textContent=Math.round((doneCount/total)*100)+'%';
1892-  const avgMin=Math.round(S.sessions.filter(s=>s.tokens>0).reduce((a,s)=>a+(s.tokens||0),0)/S.sessions.length/1000*10)/10;
1893-  $('m-avg-time').textContent='8.4m';
1894-  $('m-tokens').textContent=Math.round(S.sessions.reduce((a,s)=>a+(s.tokens||0),0)/1000)+'k';
1895-
1896-  // Donut
1897-  const circumference=100;
1898-  const colors={done:'var(--accent)',running:'var(--green)',error:'var(--red)',pending:'var(--amber)'};
1899-  let offset=0;
1900-  ['done','running','error','pending'].forEach(st=>{
1901-    const pct=(counts[st]/total)*circumference;
1902-    const el=$(`donut-${st}`);
1903-    el.setAttribute('stroke-dasharray',`${pct} ${circumference-pct}`);
1904-    el.setAttribute('stroke-dashoffset',-offset);
1905-    offset+=pct;
1906-    $(`leg-${st}`).textContent=counts[st];
1907-  });
1908-
1909-  // Bar chart
1910-  const barData=[
1911-    {label:'Lun',v:4},{label:'Mar',v:7},{label:'Mié',v:5},{label:'Jue',v:9},
1912-    {label:'Vie',v:12},{label:'Sáb',v:6},{label:'Hoy',v:S.sessions.length}
1913-  ];
1914-  const maxV=Math.max(...barData.map(d=>d.v));
1915-  $('bar-sessions').innerHTML=barData.map(d=>`
1916-    <div class="bar-wrap">
1917-      <div class="bar success-bar" style="height:${(d.v/maxV)*90}%" title="${d.v} sesiones"></div>
1918-      <div class="bar-label">${d.label}</div>
1919-    </div>`).join('');
1920-
1921-  // Token timeline
1922-  const recent=S.sessions.slice(0,7);
1923-  const maxTok=Math.max(...recent.map(s=>s.tokens||0))||1;
1924-  $('token-timeline').innerHTML=recent.map(s=>`
1925-    <div class="timeline-row">
1926-      <div class="tl-time">${s.id}</div>
1927-      <div class="tl-bar-outer">
1928-        <div class="tl-bar-inner" style="width:${((s.tokens||0)/maxTok)*100}%;background:linear-gradient(to right,var(--accent),var(--cyan))"></div>
1929-      </div>
1930-      <div class="tl-val">${s.tokens?Math.round(s.tokens/1000)+'k':'—'}</div>
1931-    </div>`).join('');
1932-}
1933-
1934-/* ─── DIFF VIEWER ─── */
1935-function renderDiff(sess){
1936-  const diffs=sess.diff||[];
1937-  let addTotal=0,delTotal=0;
1938-  if(!diffs.length){
1939-    $('diff-content').innerHTML=`<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">No hay diff disponible para esta sesión.</div>`;
1940-    $('diff-stat-add').textContent='+0 adiciones';
1941-    $('diff-stat-del').textContent='-0 eliminaciones';
1942-    $('diff-stat-files').textContent='0 archivos';
1943-    return;
1944-  }
1945-  $('diff-stat-files').textContent=`${diffs.length} archivo${diffs.length!==1?'s':''}`;
1946-  const html=diffs.map(file=>{
1947-    const hunksHtml=file.hunks.map(hunk=>{
1948-      const linesHtml=hunk.lines.map((l,li)=>{
1949-        const type=l.t||'ctx';
1950-        if(type==='add') addTotal++;
1951-        if(type==='del') delTotal++;
1952-        const ln=l.ln||'';
1953-        const sign=type==='add'?'+':type==='del'?'-':' ';
1954-        return `<div class="diff-line ${type}">
1955-          <div class="diff-ln">${ln}</div>
1956-          <div class="diff-sign">${sign}</div>
1957-          <div class="diff-code">${escapeHtml(l.code||'')}</div>
1958-        </div>`;
1959-      }).join('');
1960-      return `<div class="diff-line hunk"><div class="diff-ln"></div><div class="diff-sign"></div><div class="diff-code">${hunk.header}</div></div>${linesHtml}`;
1961-    }).join('');
1962-    return `<div class="diff-file-header">
1963-      <span class="diff-file-badge ${file.type}">${file.type}</span>
1964-      <span style="font-family:var(--font-mono)">${file.file}</span>
1965-    </div>
1966-    <div class="diff-body">${hunksHtml}</div>`;
1967-  }).join('');
1968-  $('diff-content').innerHTML=html;
1969-  $('diff-stat-add').textContent=`+${addTotal} adición${addTotal!==1?'es':''}`;
1970-  $('diff-stat-del').textContent=`-${delTotal} eliminación${delTotal!==1?'es':''}`;
1971-}
1972-function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
1973-
1974-/* ─── DRAWER ─── */
1975-function openDrawer(sessionId, simulate=false){
1976-  const s=S.sessions.find(x=>x.id===sessionId);if(!s) return;
1977-  $('dr-sub').textContent=`Sesión ${s.id} — ${s.repo} / ${s.branch}`;
1978-  $('dr-title').textContent=s.task;
1979-  const term=$('dr-term');term.innerHTML='';
1980-  s.logs.forEach(l=>appendTermLine(l));
1981-  renderDiff(s);
1982-  $('dr-overlay').classList.add('open');
1983-  $('drawer').classList.add('open');
1984-  if(simulate) runSimulation(s);
1985-}
1986-
1987-function appendTermLine(txt){
1988-  const line=document.createElement('div');
1989-  let cls='tline ';
1990-  if(txt.includes('[SYSTEM]')) cls+='sys';
1991-  else if(txt.includes('[GIT]')) cls+='git';
1992-  else if(txt.includes('[JULES]')) cls+='agent';
1993-  else if(txt.includes('[ERROR]')||txt.includes('ERROR:')) cls+='err';
1994-  else cls+='cmd';
1995-  line.className=cls;line.textContent=txt;
1996-  const term=$('dr-term');
1997-  term.appendChild(line);
1998-  term.scrollTop=term.scrollHeight;
1999-}
2000-
2001-function closeDrawer(){
2002-  $('dr-overlay').classList.remove('open');
2003-  $('drawer').classList.remove('open');
2004-}
2005-
2006-function runSimulation(sess){
2007-  let step=0;
2008-  const steps=[
2009-    `[GIT] Sincronizando sandbox con repositorio remoto...`,
2010-    `[JULES] Leyendo componentes y detectando patrones...`,
2011-    `[JULES] Generando plan (1 nuevo, 2 modificados)...`,
2012-    `[JULES] Aplicando cambios y mejoras de diseño...`,
2013-    `[TESTS] Ejecutando suite Jest de validación.`,
2014-    `[TESTS] 15/15 pruebas pasadas sin regresión.`,
2015-    `[GIT] Commit generado: 'refactor: ${sess.task.slice(0,30)}...'`,
2016-    `[SUCCESS] Procedimiento completado. Cambios integrados.`
2017-  ];
2018-  if(S.runSimInterval) clearInterval(S.runSimInterval);
2019-  let dur=0,toks=sess.tokens||0;
2020-  S.runSimInterval=setInterval(()=>{
2021-    if(step<steps.length){
2022-      const l=steps[step];sess.logs.push(l);appendTermLine(l);
2023-      if(step%2===0) addTel("JULES",l.split(']')[1].trim().slice(0,60),"info");
2024-      step++;dur+=2;toks+=Math.floor(Math.random()*1800+600);
2025-      sess.duration=`${dur}s`;sess.tokens=toks;
2026-      renderTable();renderMetrics();
2027-    } else {
2028-      clearInterval(S.runSimInterval);
2029-      sess.status="done";sess.duration="14s";
2030-      sess.logs.push(`[SYSTEM] Ejecución finalizada.`);
2031-      appendTermLine(`[SYSTEM] Ejecución finalizada.`);
2032-      renderTable();renderKanban();updateStats();renderMetrics();
2033-      addTel("SYSTEM",`Sesión ${sess.id} completada.`,"success");
2034-      showToast(`Sesión ${sess.id} completada`);
2035-      pushNotif('Sesión completada',`Jules terminó: ${sess.task.slice(0,50)}...`,'success');
2036-    }
2037-  },1500);
2038-}
2039-
2040-/* ─── LAUNCH SESSION ─── */
2041-function launchSession(){
2042-  const txt=$('session-prompt').value.trim();
2043-  if(!txt){
2044-    $('session-prompt').focus();
2045-    $('session-prompt').style.borderBottomColor='var(--red)';
2046-    showToast("Describe una tarea para Jules","red");return;
2047-  }
2048-  $('session-prompt').style.borderBottomColor='';
2049-  const id=`#js-0${S.sessions.length+43}`;
2050-  const branch=S.repos[window.JulesPanelState.activeRepo].active.split(' ')[0];
2051-  const sess={id,task:txt,repo:window.JulesPanelState.activeRepo,branch,status:"running",duration:"0s",date:"ahora mismo",tokens:0,logs:[`[SYSTEM] Petición autónoma registrada para ${window.JulesPanelState.activeRepo}/${branch}.`,`[SYSTEM] Analizando parámetros...`],diff:[]};
2052-  S.sessions.unshift(sess);
2053-  $('session-prompt').value='';
2054-  renderTable();renderKanban();updateStats();
2055-  addTel("JULES",`Sesión ${id} iniciada.`,"info");
2056-  showToast(`Sesión ${id} iniciada en ${window.JulesPanelState.activeRepo}`);
2057-  pushNotif('Nueva sesión iniciada',`${id} lanzada en ${window.JulesPanelState.activeRepo}/${branch}`,'info');
2058-  openDrawer(id,true);
2059-}
2060-
2061-/* ─── FILTERS ─── */
2062-function filterByStatus(status){
2063-  S.filter.status=status;
2064-  document.querySelectorAll('#filter-pills .fpill').forEach(p=>p.classList.toggle('active',p.dataset.filter===status));
2065-  renderTable();
2066-}
2067-function clearFilters(){filterByStatus('all');$('tbl-search').value='';S.filter.search='';renderTable()}
2068-function focusRepos(){showToast("Selecciona un repositorio en la barra lateral")}
2069-function focusBranch(){$('branch-sel').focus();showToast("Cambia la rama con el selector")}
2070-function scrollToSession(){$('session-anchor').scrollIntoView({behavior:'smooth'});setTimeout(()=>$('session-prompt').focus(),400)}
2071-
2072-/* ─── MODALS ─── */
2073-function openApiModal(){$('api-modal').classList.add('open')}
2074-function closeApiModal(){$('api-modal').classList.remove('open')}
2075-function openClaudeChat(){$('claude-modal').classList.add('open')}
2076-function closeClaudeChat(){$('claude-modal').classList.remove('open')}
2077-function openDocs(){alert("📚 DOCUMENTACIÓN JULES AGENT\n\nJules es un agente autónomo que lee, escribe y refactoriza código.\n\nModos:\n• Automático: Jules hace merge sin revisión manual.\n• Con Revisión: Jules crea un PR y espera aprobación.\n• Crear Tests: Se generan pruebas para cada cambio.")}
2078-
2079-/* ─── CLAUDE CHAT ─── */
2080-function sendClaudeMsg(){
2081-  const input=$('claude-in');const txt=input.value.trim();if(!txt) return;
2082-  const area=$('claude-chat-area');
2083-  const uEl=document.createElement('div');
2084-  uEl.style.cssText='margin-top:12px;background:rgba(124,58,237,.12);border:1px solid rgba(124,58,237,.2);border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.5;font-family:var(--font-ui)';
2085-  uEl.innerHTML=`<span style="font-size:10px;color:var(--text3);font-family:var(--font-mono)">TÚ</span><br>${txt}`;
2086-  area.appendChild(uEl);input.value='';area.scrollTop=area.scrollHeight;
2087-  const typing=document.createElement('div');
2088-  typing.style.cssText='margin-top:10px;color:var(--text3);font-size:12px;font-style:italic;font-family:var(--font-ui)';
2089-  typing.textContent='Claude está escribiendo...';area.appendChild(typing);area.scrollTop=area.scrollHeight;
2090-  setTimeout(()=>{
2091-    typing.remove();
2092-    const repo=S.repos[window.JulesPanelState.activeRepo];const branch=repo.active.split(' ')[0];
2093-    const responses=[
2094-      `Para el repositorio <strong style="color:var(--accent2)">${window.JulesPanelState.activeRepo}/${branch}</strong>, te sugiero: ${txt.length>30?'considera dividir la tarea en pasos más pequeños y especificar los archivos afectados.':'sé más específico sobre qué componentes o archivos deben modificarse.'}`,
2095-      `Un buen prompt para Jules sería: <em style="color:var(--claude-text)">"Refactoriza [componente] siguiendo el patrón existente, mantén compatibilidad con la rama ${branch} y crea tests unitarios para los cambios."</em>`,
2096-      `Puedo ayudarte a mejorar el prompt. Añade: contexto del error, archivos relevantes, comportamiento esperado vs actual. Esto mejora significativamente los resultados de Jules.`
2097-    ];
2098-    const cEl=document.createElement('div');
2099-    cEl.style.cssText='margin-top:10px;border-left:2px solid var(--claude-border);padding-left:12px;font-size:13px;line-height:1.6;font-family:var(--font-ui);color:var(--text2)';
2100-    cEl.innerHTML=`<span style="font-size:10px;color:var(--claude-text);font-family:var(--font-mono);display:block;margin-bottom:4px">CLAUDE</span>${responses[Math.floor(Math.random()*responses.length)]}`;
2101-    area.appendChild(cEl);area.scrollTop=area.scrollHeight;
2102-  },1200);
2103-}
2104-
2105-/* ─── MOBILE SIDEBAR ─── */
2106-function openMobileSidebar(){
2107-  $('app-sidebar').classList.add('mob-open');
2108-  $('sidebar-backdrop').classList.add('open');
2109-}
2110-function closeMobileSidebar(){
2111-  $('app-sidebar').classList.remove('mob-open');
2112-  $('sidebar-backdrop').classList.remove('open');
2113-}
2114-
2115-/* ─── MOBILE PANELS ─── */
2116-function renderMobilePanel(name){
2117-  ['dashboard','kanban','metrics','config','session','history'].forEach(n=>{
2118-    const el=$(`mob-panel-${n}`);
2119-    if(el) el.classList.toggle('active',n===name);
2120-  });
2121-  const el=$(`mob-panel-${name}`);if(!el) return;
2122-  el.innerHTML='';
2123-  const r=S.repos[window.JulesPanelState.activeRepo];
2124-
2125-  if(name==='dashboard'){
2126-    el.innerHTML=`
2127-      <div class="card glass"><div class="card-head"><div class="card-title">Proyecto Activo</div></div>
2128-        <div class="card-body">
2129-          <div style="font-size:17px;font-weight:700;color:var(--accent2);margin-bottom:6px">${window.JulesPanelState.activeRepo} — ${r.active.split(' ')[0]}</div>
2130-          <p style="font-size:12px;color:var(--text2)">${r.path}</p>
2131-          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px">
2132-            <div style="background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;text-align:center">
2133-              <div style="font-family:var(--font-mono);font-size:22px;font-weight:600;color:var(--green)">${S.sessions.filter(s=>s.status==='running').length}</div>
2134-              <div style="font-size:10px;color:var(--text2);text-transform:uppercase;margin-top:2px">Activas</div>
2135-            </div>
2136-            <div style="background:rgba(0,0,0,.2);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;text-align:center">
2137-              <div style="font-family:var(--font-mono);font-size:22px;font-weight:600;color:var(--accent2)">${S.sessions.length}</div>
2138-              <div style="font-size:10px;color:var(--text2);text-transform:uppercase;margin-top:2px">Totales</div>
2139-            </div>
2140-          </div>
2141-        </div>
2142-      </div>
2143-      <div class="card glass"><div class="card-head"><div class="card-title">Acciones Rápidas</div></div>
2144-        <div class="card-body" style="display:flex;flex-direction:column;gap:9px">
2145-          <button class="btn btn-primary" onclick="document.querySelector('[data-tab=session]').click()" style="width:100%;justify-content:center">▶ Nueva Tarea Jules</button>
2146-          <button class="btn btn-ghost" onclick="document.querySelector('[data-tab=kanban]').click()" style="width:100%;justify-content:center">📋 Ver Kanban</button>
2147-          <button class="btn btn-ghost" onclick="document.querySelector('[data-tab=metrics]').click()" style="width:100%;justify-content:center">📊 Ver Métricas</button>
2148-          <button class="btn-claude" onclick="openClaudeChat()" style="justify-content:center"><span class="claude-icon">C</span>Claude Chat</button>
2149-        </div>
2150-      </div>`;
2151-  } else if(name==='kanban'){
2152-    el.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-size:15px;font-weight:700">Kanban</div><button class="btn btn-primary btn-sm" onclick="openNewTaskModal()">+ Nueva</button></div>`;
2153-    ['pending','running','done','error'].forEach(st=>{
2154-      const items=S.sessions.filter(s=>s.status===st);
2155-      const nm={pending:'En Cola',running:'En Progreso',done:'Completado',error:'Error'}[st];
2156-      const col=document.createElement('div');
2157-      col.className='kb-col';
2158-      col.innerHTML=`<div class="kb-col-head"><div class="kb-col-name"><span class="col-dot" style="background:var(--${st==='running'?'green':st==='done'?'accent':st==='pending'?'amber':'red'})"></span>${nm}</div><span class="kb-count">${items.length}</span></div>`;
2159-      const cards=document.createElement('div');cards.className='kb-cards';
2160-      items.forEach(s=>{
2161-        const c=document.createElement('div');c.className=`kb-card ${st}`;
2162-        c.innerHTML=`<div class="kb-card-id">${s.id}</div><div class="kb-card-task">${s.task}</div><div class="kb-card-meta"><span class="kb-card-repo">${s.repo}</span><span class="kb-card-time">${s.duration}</span></div>`;
2163-        c.onclick=()=>openDrawer(s.id);cards.appendChild(c);
2164-      });
2165-      col.appendChild(cards);el.appendChild(col);
2166-    });
2167-  } else if(name==='metrics'){
2168-    el.innerHTML=`<div style="font-size:15px;font-weight:700;margin-bottom:4px">Métricas</div>
2169-      <div class="card glass">
2170-        <div class="metric-stat-row" style="grid-template-columns:1fr 1fr">
2171-          <div class="metric-stat"><span class="metric-stat-num" style="font-size:18px">${Math.round((S.sessions.filter(s=>s.status==='done').length/S.sessions.length)*100)}%</span><span class="metric-stat-lbl">Éxito</span></div>
2172-          <div class="metric-stat"><span class="metric-stat-num" style="font-size:18px">${Math.round(S.sessions.reduce((a,s)=>a+(s.tokens||0),0)/1000)}k</span><span class="metric-stat-lbl">Tokens</span></div>
2173-        </div>
2174-      </div>
2175-      <div class="card glass">
2176-        <div class="card-head"><div class="card-title">Tokens por Sesión</div></div>
2177-        <div class="timeline-wrap" style="padding:12px 14px">
2178-          ${S.sessions.slice(0,5).map(s=>{const maxT=Math.max(...S.sessions.map(x=>x.tokens||0))||1;return`<div class="timeline-row"><div class="tl-time" style="width:60px;font-size:9px">${s.id}</div><div class="tl-bar-outer"><div class="tl-bar-inner" style="width:${((s.tokens||0)/maxT)*100}%;background:linear-gradient(to right,var(--accent),var(--cyan))"></div></div><div class="tl-val">${s.tokens?Math.round(s.tokens/1000)+'k':'—'}</div></div>`}).join('')}
2179-        </div>
2180-      </div>`;
2181-  } else if(name==='config'){
2182-    el.innerHTML=`<div class="card glass"><div class="card-head"><div class="card-title">Configuración</div></div>
2183-      <div class="card-body">
2184-        <span class="cfg-label">Repositorio</span><div class="cfg-path">${r.path}</div>
2185-        <label class="cfg-label">Rama activa</label>
2186-        <div class="sel-wrap"><select class="cfg-input" style="padding:8px 30px 8px 12px;appearance:none;cursor:pointer" onchange="S.repos['${window.JulesPanelState.activeRepo}'].active=this.value;updateContext();showToast('Rama: '+this.value.split(' ')[0])">${r.branches.map(b=>`<option ${b===r.active?'selected':''}>${b}</option>`).join('')}</select></div>
2187-        <button class="btn btn-ghost" style="width:100%;margin-top:10px;justify-content:center" onclick="const n=prompt('Nombre nueva rama:');if(n){const c=n.trim().toLowerCase().replace(/\\s+/g,'-');S.repos['${window.JulesPanelState.activeRepo}'].branches.push(c);S.repos['${window.JulesPanelState.activeRepo}'].active=c;updateContext();renderMobilePanel('config');showToast('Rama: '+c)}">+ Nueva rama</button>
2188-      </div></div>`;
2189-  } else if(name==='session'){
2190-    el.innerHTML=`<div class="card glass"><div class="card-head"><div class="card-title">Lanzar Tarea Jules</div></div>
2191-      <div class="card-body" style="padding:0">
2192-        <textarea id="mob-prompt" class="prompt-area" style="min-height:120px;border-radius:0" placeholder="Describe la tarea para Jules..."></textarea>
2193-        <div style="padding:14px 18px;display:flex;flex-direction:column;gap:8px">
2194-          <div style="font-size:11px;color:var(--text2)">Repo: <strong>${window.JulesPanelState.activeRepo}</strong> / ${r.active.split(' ')[0]}</div>
2195-          <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="const t=document.getElementById('mob-prompt').value.trim();if(!t){showToast('Describe una tarea','red');return}$('session-prompt').value=t;launchSession();document.querySelector('[data-tab=history]').click()">▶ Iniciar Ejecución</button>
2196-        </div>
2197-      </div></div>`;
2198-  } else if(name==='history'){
2199-    el.innerHTML=`<div class="card glass"><div class="card-head"><div class="card-title">Historial</div></div>
2200-      <div style="max-height:500px;overflow-y:auto">
2201-        ${S.sessions.map(s=>`<div style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="openDrawer('${s.id}')">
2202-          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
2203-            <span class="sid">${s.id}</span>
2204-            <span class="sbadge ${s.status}" style="font-size:9px;padding:2px 6px"><span class="pulse-dot"></span>${{running:'activo',done:'listo',error:'error',pending:'cola'}[s.status]}</span>
2205-          </div>
2206-          <div style="font-size:13px;font-weight:500;margin-bottom:3px;color:var(--text)">${s.task}</div>
2207-          <div style="font-size:11px;color:var(--text2)">${s.repo}/${s.branch} · ${s.duration} · ${s.date}</div>
2208-        </div>`).join('')}
2209-      </div></div>`;
2210-  }
2211-}
2212-
2213-/* ─── EVENT LISTENERS ─── */
2214-$('alias-in').addEventListener('input',e=>{
2215-  const n=e.target.value.trim();if(n){S.repos[window.JulesPanelState.activeRepo].name=n;renderRepos()}
2216-});
2217-$('branch-sel').addEventListener('change',e=>{
2218-  S.repos[window.JulesPanelState.activeRepo].active=e.target.value;updateContext();
2219-  addTel("GIT",`Checkout → ${e.target.value.split(' ')[0]}`,"info");
2220-  showToast(`Rama: ${e.target.value.split(' ')[0]}`);
2221-});
2222-$('new-branch-btn').addEventListener('click',()=>{
2223-  const n=prompt("Nombre de la nueva rama:");if(!n||!n.trim()) return;
2224-  const clean=n.trim().toLowerCase().replace(/\s+/g,'-');
2225-  S.repos[window.JulesPanelState.activeRepo].branches.push(clean);S.repos[window.JulesPanelState.activeRepo].active=clean;
2226-  updateContext();addTel("GIT",`Nueva rama: ${clean}`,"success");showToast(`Rama '${clean}' creada`);
2227-});
2228-document.querySelectorAll('.opt-pill').forEach(p=>{
2229-  p.addEventListener('click',()=>{p.classList.toggle('active');addTel("SYSTEM",`Opción ${p.textContent.trim()}: ${p.classList.contains('active')?'ON':'OFF'}`,"info")});
2230-});
2231-$('launch-btn').addEventListener('click',launchSession);
2232-$('dr-overlay').addEventListener('click',closeDrawer);
2233-$('dr-close').addEventListener('click',closeDrawer);
2234-$('dr-stop').addEventListener('click',()=>{if(S.runSimInterval){clearInterval(S.runSimInterval);showToast("Proceso detenido","amber")}closeDrawer()});
2235-$('dr-rerun').addEventListener('click',()=>{
2236-  if(S.runSimInterval) clearInterval(S.runSimInterval);
2237-  $('dr-term').innerHTML='';
2238-  const s=S.sessions[0];
2239-  if(s){s.logs=[`[SYSTEM] Reiniciando hilo...`];openDrawer(s.id,true)}
2240-});
2241-$('tbl-search').addEventListener('input',e=>{S.filter.search=e.target.value;renderTable()});
2242-document.querySelectorAll('#filter-pills .fpill').forEach(p=>{
2243-  p.addEventListener('click',()=>filterByStatus(p.dataset.filter));
2244-});
2245-$('api-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeApiModal()});
2246-$('claude-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeClaudeChat()});
2247-$('new-task-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeNewTaskModal()});
2248-$('claude-in').addEventListener('keydown',e=>{if(e.key==='Enter')sendClaudeMsg()});
2249-$('modal-save').addEventListener('click',()=>{showToast("Credenciales guardadas");closeApiModal()});
2250-
2251-let keyVis=false;
2252-$('toggle-key').addEventListener('click',()=>{
2253-  keyVis=!keyVis;$('api-key-in').type=keyVis?'text':'password';
2254-  $('toggle-key').textContent=keyVis?'🙈':'👁️';
2255-});
2256-document.querySelectorAll('.pcard').forEach(c=>{
2257-  c.addEventListener('click',()=>{document.querySelectorAll('.pcard').forEach(x=>x.classList.remove('selected'));c.classList.add('selected')});
2258-});
2259-
2260-// Mobile
2261-$('mob-menu-btn').addEventListener('click',openMobileSidebar);
2262-$('sidebar-backdrop').addEventListener('click',closeMobileSidebar);
2263-$('sb-close-btn').addEventListener('click',closeMobileSidebar);
2264-
2265-const sbCloseBtn=$('sb-close-btn');
2266-function handleResize(){sbCloseBtn.style.display=window.innerWidth<=900?'block':'none'}
2267-handleResize();
2268-window.addEventListener('resize',handleResize);
2269-
2270-document.querySelectorAll('.mtab').forEach(tab=>{
2271-  tab.addEventListener('click',()=>{
2272-    document.querySelectorAll('.mtab').forEach(t=>t.classList.remove('active'));
2273-    tab.classList.add('active');
2274-    renderMobilePanel(tab.dataset.tab);
2275-  });
2276-});
2277-
2278-// Keyboard shortcuts
2279-document.addEventListener('keydown',e=>{
2280-  if(e.key==='Escape'){
2281-    closeDrawer();closeApiModal();closeClaudeChat();closeNewTaskModal();
2282-    $('notif-panel').classList.remove('open');
2283-  }
2284-});
2285-
2286-/* ─── INIT ─── */
2287-function showAuthCard(id) {
2288-    document.querySelectorAll(".auth-card").forEach(c => c.classList.add("hidden"));
2289-    $(id).classList.remove("hidden");
2290-    $("auth-overlay").classList.add("show");
2291-}
2292-
2293-function forceOpenPanel() {
2294-    $("auth-overlay").classList.remove("show");
2295-    $("app-root").classList.remove("locked");
2296-    initRealPanel(null);
2297-}
2298-
2299-function handleGlobalAuthError() {
2300-    showAuthCard("auth-card-login");
2301-    $("app-root").classList.add("locked");
2302-}
2303-
2304-async function initRealPanel(user) {
2305-    if (!user && !getGitHubToken()) {
2306-        showAuthCard("auth-card-login");
2307-        return;
2308-    }
2309-
2310-    $("auth-overlay").classList.remove("show");
2311-    $("app-root").classList.remove("locked");
2312-
2313-    addTel("SYSTEM", `Iniciado como ${user ? user.login : "Invitado"}`, "success");
2314-
2315-    // real init
2316-    // await initializeRepoSelector();
2317-    // await refreshSessions();
2318-}
2319-
2320-function init(){
2321-  let arrancado = false;
2322-
2323-  function boot(user) {
2324-    if (arrancado) return;
2325-    arrancado = true;
2326-    initRealPanel(user);
2327-  }
2328-
2329-  document.addEventListener("authReady", (e) => boot(e.detail?.user));
2330-
2331-  setTimeout(() => {
2332-    if (!arrancado) {
2333-      if (getGitHubToken()) {
2334-        boot(window.githubApi?.user);
2335-      } else {
2336-        showAuthCard("auth-card-error");
2337-      }
2338-    }
2339-  }, 5000);
2340-
2341-  if(window.innerWidth<=900) renderMobilePanel("dashboard");
2342-}
2343-window.onload=init;
2344-</html>
