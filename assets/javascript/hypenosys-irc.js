/* Hypenosys IRC web client. Data from IRC over WSS or authenticated, same-origin gateway only.
 * No mock data, no remote admin configuration and no privileged commands.
 */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const views=['chat','canales','bots','bridges','incidents','config'];
const endpoints={bots:'/api/irc/bots',bridges:'/api/irc/bridges',incidents:'/api/irc/incidents'};
const defaultEndpoint='wss://irc.hypenosys.com/webirc';
const display={chat:'IRC',canales:'Canales',bots:'Bots',bridges:'Bridges',incidents:'Incidents',config:'Configuración'};
let ws=null,connected=false,current='#general',nick='',channels=new Map(),joined=new Set(),msgs=new Map(),localErrors=[];
let settings={endpoint:defaultEndpoint,nick:'guest'+Math.floor(Math.random()*9000+1000),channel:'#general'};
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const trim=(value,max=300)=>String(value??'').replace(/[\u0000\r\n]/g,' ').slice(0,max);
function validNick(v){return /^[A-Za-z\[\]\\`_^{|}][A-Za-z0-9\[\]\\`_^{|}-]{0,22}$/.test(v);}
function validChannel(v){return /^#[^\u0000\r\n\s,:]{1,60}$/.test(v);}
function validWss(v){try{const u=new URL(v);return u.protocol==='wss:'&&!u.username&&!u.password&&!u.search&&!u.hash&&['irc.hypenosys.com','ws.irc.hypenosys.com','localhost'].includes(u.hostname.toLowerCase())?u.href:null;}catch{return null;}}
try{const saved=JSON.parse(localStorage.getItem('hypenosys-irc-preferences-v1')||'{}');if(validWss(saved.endpoint))settings.endpoint=saved.endpoint;if(validNick(saved.nick))settings.nick=saved.nick;if(validChannel(saved.channel))settings.channel=saved.channel;}catch{}
nick=settings.nick;current=settings.channel;
$('wss-url').value=settings.endpoint;$('irc-nick').value=nick;$('default-channel').value=current;$('join-channel').value=current;$('active-channel').textContent=current;
function feedback(text,kind='info'){$('feedback').textContent=text;$('feedback').dataset.kind=kind;}
function localIncident(text){localErrors.unshift({at:new Date().toISOString(),text:trim(text,260)});localErrors=localErrors.slice(0,40);renderIncidents();feedback(text,'error');}
function badge(kind,text){const b=make('span',text,'state');b.dataset.kind=kind;return b;}
function line(parent,left,detail,right){const d=make('div',undefined,'row');const section=make('div');section.append(make('b',trim(left,130)));if(detail)section.append(make('p',trim(detail,240)));d.append(section);if(right)d.append(right);parent.append(d);}
function setStatus(text,kind){$('connection-status').textContent=text;$('connection-status').dataset.kind=kind;$('connect-btn').textContent=ws?'Desconectar':'Conectar';$('message-send').disabled=!connected;$('channels-refresh').disabled=!connected;$('join-btn').disabled=!connected;}
function show(view){
 if(!views.includes(view))view='chat';
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',b.dataset.view===view?'page':'false'));
 document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==view);
 $('view-title').textContent=display[view];
 if(['bots','bridges','incidents'].includes(view))void refresh(view);
}
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{location.hash=btn.dataset.view;show(btn.dataset.view);}));
window.addEventListener('hashchange',()=>show(location.hash.slice(1)));
function parse(raw){
 let text=raw.trim(),prefix='';
 if(!text)return null;
 if(text.startsWith('@')){const i=text.indexOf(' ');if(i<0)return null;text=text.slice(i+1);}
 if(text.startsWith(':')){const i=text.indexOf(' ');if(i<0)return null;prefix=text.slice(1,i);text=text.slice(i+1);}
 const first=text.indexOf(' '),command=(first<0?text:text.slice(0,first)).toUpperCase();
 text=first<0?'':text.slice(first+1);
 const params=[];
 while(text.length){text=text.trimStart();if(!text)break;if(text.startsWith(':')){params.push(text.slice(1));break;}const i=text.indexOf(' ');if(i<0){params.push(text);break;}params.push(text.slice(0,i));text=text.slice(i+1);}
 return {prefix,command,params};
}
function write(command){if(!ws||ws.readyState!==WebSocket.OPEN)return false;const cleaned=String(command).replace(/[\r\n\u0000]/g,'');if(!cleaned||new TextEncoder().encode(cleaned+'\r\n').length>510)return false;ws.send(cleaned+'\r\n');return true;}
function addMessage(channel,who,message){
 if(!msgs.has(channel))msgs.set(channel,[]);
 const messages=msgs.get(channel);messages.push({when:new Date().toISOString(),who:trim(who,32),message:trim(message,480)});
 if(messages.length>250)messages.splice(0,messages.length-250);
 if(channel===current)renderMessages();
}
function renderMessages(){
 const node=$('feed');node.replaceChildren();
 const history=msgs.get(current)||[];
 if(!history.length){node.append(make('p','Todavía no hay mensajes recibidos para este canal.','hint'));return;}
 for(const m of history){const div=make('div',undefined,'line');const time=make('time',new Date(m.when).toLocaleTimeString('es-ES'));div.append(time,make('b',m.who),make('span',m.message));node.append(div);}
 node.scrollTop=node.scrollHeight;
}
function renderChannels(){
 const target=$('channels-list');target.replaceChildren();const q=$('channel-search').value.trim().toLowerCase();
 const list=[...channels.values()].filter(c=>c.name.toLowerCase().includes(q)||(c.topic||'').toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
 if(!list.length){target.append(make('p',connected?'No hay canales publicados por el servidor que coincidan.':'Conecta al IRC para solicitar la lista real.','hint'));return;}
 list.forEach(c=>{const action=make('button','Entrar','btn secondary');action.type='button';action.disabled=!connected;action.addEventListener('click',()=>join(c.name));line(target,c.name,c.topic||'Sin descripción publicada',action);});
}
function onLine(raw){
 const data=parse(raw);if(!data)return;const {prefix,command,params}=data;const speaker=trim(prefix.split('!')[0],30);
 if(command==='PING'){write('PONG :'+trim(params[0],350));return;}
 if(command==='001'){connected=true;setStatus('Conectado','live');write('JOIN '+settings.channel);write('LIST');feedback('Identidad IRC aceptada. Conectado al servicio remoto.','success');}
 if(command==='433'||command==='464'||command==='465'||command==='ERROR')localIncident('Servidor IRC: '+trim(params.at(-1)||command,250));
 if(command==='322'&&params.length>=3){const channel=params[1];if(validChannel(channel)){channels.set(channel,{name:channel,count:Number(params[2]),topic:trim(params[3],220)});renderChannels();}}
 if(command==='332'&&params.length>=3){const c=params[1];if(validChannel(c)){channels.set(c,{...(channels.get(c)||{}),name:c,topic:trim(params[2],220)});renderChannels();}}
 if(command==='JOIN'&&params.length){const c=params[0];if(speaker.toLowerCase()===nick.toLowerCase()&&validChannel(c)){joined.add(c);current=c;$('active-channel').textContent=c;renderMessages();}}
 if(command==='PART'&&params.length){const c=params[0];if(speaker.toLowerCase()===nick.toLowerCase()){joined.delete(c);}}
 if(command==='PRIVMSG'&&params.length>=2){const target=params[0];if(target.startsWith('#'))addMessage(target,speaker,params[1]);}
 if(command==='NOTICE'&&params.length>=2){addMessage(current,speaker||'SERVIDOR',params[1]);}
}
let intentionalClose=false;
function connect(){
 if(ws)return;
 const endpoint=validWss($('wss-url').value.trim()),newNick=$('irc-nick').value.trim(),chan=$('default-channel').value.trim();
 if(!endpoint||!validNick(newNick)||!validChannel(chan)){feedback('Endpoint WSS permitido, nick IRC y canal válidos requeridos.','error');show('config');return;}
 settings={endpoint,nick:newNick,channel:chan};nick=newNick;current=chan;
 try{ws=new WebSocket(endpoint);intentionalClose=false;connected=false;setStatus('Conectando','pending');feedback('Abriendo WSS. No se envía ningún token de cuenta.');}
 catch(e){ws=null;setStatus('Desconectado','off');localIncident('No se pudo abrir WSS: '+e.message);return;}
 ws.addEventListener('open',()=>{write('NICK '+nick);write('USER '+nick+' 0 * :Hypenosys IRC web client');});
 ws.addEventListener('message',e=>{if(typeof e.data==='string')e.data.split(/\r?\n/).forEach(text=>{if(text)onLine(text);});});
 ws.addEventListener('error',()=>localIncident('Error WSS: comprueba DNS, Cloudflare Tunnel, TLS y el servidor IRC.'));
 ws.addEventListener('close',e=>{const wasIntentional=intentionalClose;ws=null;connected=false;joined.clear();setStatus('Desconectado','off');renderChannels();if(!wasIntentional)localIncident('IRC desconectado: código '+e.code+'.');});
}
function disconnect(){if(!ws)return;intentionalClose=true;write('QUIT :Disconnected by user');ws.close(1000,'User disconnect');}
function join(channel){if(!validChannel(channel)){feedback('Nombre de canal IRC inválido.','error');return;}if(!connected){feedback('Conecta primero al IRC.','error');return;}write('JOIN '+channel);current=channel;$('active-channel').textContent=channel;renderMessages();show('chat');location.hash='chat';}
$('connect-btn').addEventListener('click',()=>ws?disconnect():connect());
$('message-form').addEventListener('submit',e=>{e.preventDefault();const text=$('message').value.trim();if(!connected||!joined.has(current)){feedback('Debes conectar y entrar en el canal antes de enviar.','error');return;}if(!text||text.includes('\n')||text.includes('\r'))return;if(text.startsWith('!')){feedback('Los comandos de agentes requieren gateway autenticado; no se enviarán como una orden.','error');return;}if(write('PRIVMSG '+current+' :'+text)){addMessage(current,nick,text);$('message').value='';}else feedback('No se pudo enviar el mensaje: revisa su longitud y conexión.','error');});
$('join-form').addEventListener('submit',e=>{e.preventDefault();join($('join-channel').value.trim());});
$('channel-search').addEventListener('input',renderChannels);
$('channels-refresh').addEventListener('click',()=>{if(!connected)return;channels.clear();renderChannels();write('LIST');feedback('Se ha solicitado LIST al servidor IRC.');});
$('prefs-form').addEventListener('submit',e=>{
 e.preventDefault();if(ws){feedback('Desconecta antes de cambiar servidor o nickname.','error');return;}
 const endpoint=validWss($('wss-url').value.trim()),newNick=$('irc-nick').value.trim(),channel=$('default-channel').value.trim();
 if(!endpoint||!validNick(newNick)||!validChannel(channel)){feedback('No se pudieron guardar preferencias: WSS/nick/canal inválidos.','error');return;}
 settings={endpoint,nick:newNick,channel};nick=newNick;current=channel;$('active-channel').textContent=channel;
 try{localStorage.setItem('hypenosys-irc-preferences-v1',JSON.stringify(settings));feedback('Preferencias guardadas solo en este navegador. Ninguna configuración remota fue modificada.','success');}
 catch{feedback('No se pudo guardar en el navegador.','error');}
});
function renderIncidents(){
 const area=$('local-incidents');area.replaceChildren();
 if(!localErrors.length){area.append(make('p','Sin errores observados en esta sesión local. Esto no confirma el estado del servidor.','hint'));return;}
 localErrors.forEach(x=>line(area,new Date(x.at).toLocaleString('es-ES'),x.text,badge('error','LOCAL')));
}
async function refresh(type){
 const destination=$(type+'-items'),info=$(type+'-status');if(!destination||!info)return;
 info.textContent='Consultando…';info.dataset.kind='pending';destination.replaceChildren();
 try{
  const response=await fetch(endpoints[type],{method:'GET',credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error(response.status===404?'La API del gateway todavía no está desplegada.':response.status===401||response.status===403?'No autorizado: inicia sesión en el gateway.':'HTTP '+response.status);
  const json=await response.json();
  const candidates=Array.isArray(json)?json:Array.isArray(json.items)?json.items:Array.isArray(json[type])?json[type]:null;
  if(!candidates)throw new Error('Respuesta incompatible con el contrato de '+type+'.');
  if(candidates.length>100)throw new Error('El gateway devolvió demasiados elementos.');
  info.textContent='Respuesta verificada · '+new Date().toLocaleTimeString('es-ES');info.dataset.kind='live';
  if(!candidates.length){destination.append(make('p','La API devolvió una lista vacía; no hay elementos registrados.','hint'));return;}
  candidates.forEach(item=>{
   if(!item||typeof item!=='object')return;
   const name=item.name||item.id||item.title||'Sin identificador';
   const state=item.status||item.state||'Estado no informado';
   const detail=(item.description||item.detail||item.message||'')+' · '+trim(state,50);
   line(destination,name,detail,badge(state==='connected'||state==='healthy'||state==='online'?'live':'off',trim(state,40)));
  });
 }catch(e){info.textContent='No verificado: '+trim(e.message,170);info.dataset.kind='error';destination.append(make('p','No se muestran registros ni estados ficticios.','hint'));}
}
document.querySelectorAll('[data-refresh]').forEach(b=>b.addEventListener('click',()=>void refresh(b.dataset.refresh)));
setStatus('Desconectado','off');renderChannels();renderMessages();renderIncidents();show(location.hash.slice(1)||'chat');
})();
