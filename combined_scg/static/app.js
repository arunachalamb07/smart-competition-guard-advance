const $ = id => document.getElementById(id);
let lastAiAlertId=null, sirenReady=false, audioCtx=null;
function playSiren(){const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;if(!audioCtx)audioCtx=new Ctx();if(audioCtx.state==='suspended')audioCtx.resume();const osc=audioCtx.createOscillator();const gain=audioCtx.createGain();osc.type='sawtooth';gain.gain.value=0.08;osc.connect(gain);gain.connect(audioCtx.destination);const now=audioCtx.currentTime;for(let i=0;i<3;i++){osc.frequency.setValueAtTime(600,now+i*1);osc.frequency.linearRampToValueAtTime(1200,now+i*1+0.5);osc.frequency.linearRampToValueAtTime(600,now+i*1+1);}osc.start(now);osc.stop(now+3);}
function enableSiren(){sirenReady=true;playSiren();$('soundBtn').textContent='🔊 Siren sound on';}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function refresh(){
  try{
    const r=await fetch('/api/dashboard'); const d=await r.json();
    if(lastAiAlertId===null){lastAiAlertId=d.latest_ai_alert_id}
    else if(d.latest_ai_alert_id>lastAiAlertId){lastAiAlertId=d.latest_ai_alert_id; if(sirenReady) playSiren();}
    $('teamCount').textContent=d.teams.length;
    $('onlineCount').textContent=d.laptops.filter(x=>x.online).length;
    $('laptopCount').textContent=d.laptops.length;
    $('alertCount').textContent=d.pending_alerts;
    $('teams').innerHTML=d.teams.length?d.teams.slice().sort((a,b)=>(b.eligible||0)-(a.eligible||0)).map(t=>`
      <div class="team-row"><div><div class="team-name">${esc(t.name)}</div><div class="team-code">TEAM CODE: ${esc(t.code)}</div><div class="meta">${t.online_count||0} online / ${t.laptop_count} registered · Required ${t.member_count}</div></div><span class="status">${t.eligible?'MONITORING READY':'PENDING'}</span></div>`).join(''):'<div class="empty">Create your first team to begin.</div>';
    $('laptops').className='laptop-list'+(d.laptops.length?'':' empty');
    $('laptops').innerHTML=d.laptops.length?d.laptops.map(l=>`
      <div class="laptop-row"><div><b>${esc(l.name)}</b>${l.ai_used?' <span class="siren-badge"><span class="siren-light"></span>AI USED</span>':''}<div class="meta">${esc(l.team_name)} · Last seen: ${esc(l.last_seen||'—')}</div></div><span class="status ${l.online?'':'off'}">${l.online?'ONLINE':'OFFLINE'}</span></div>`).join(''):'No laptops connected yet. Run the laptop agent or configure the browser extension.';
    populateActivity(d);
    $('events').innerHTML=d.events.length?d.events.map(e=>`
      <tr class="${e.reviewed?'hidden-row':''}"><td>${esc(e.created_at)}</td><td><b>${esc(e.team_name)}</b><div class="meta">${esc(e.laptop_name||'Unknown device')}</div></td><td>${esc(e.event_type)}</td><td>${esc(e.detail)}</td><td><span class="severity ${esc(e.severity)}">${esc(e.severity.toUpperCase())}</span></td><td>${e.reviewed?'<span class="reviewed">REVIEWED</span>':`<button class="small" onclick="reviewEvent(${e.id})">Review</button>`} <button class="small danger" onclick="deleteEvent(${e.id})">Delete</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">No events recorded yet.</td></tr>';
  }catch(e){console.error(e)}
}
async function reviewEvent(id){await fetch(`/api/events/${id}/review`,{method:'POST'});refresh()}
async function deleteEvent(id){if(!confirm("Delete this event record? This cannot be undone."))return;const r=await fetch(`/api/events/${id}`,{method:"DELETE"});if(r.ok)refresh();else alert("Delete failed")}
async function deleteAllEvents(){if(!confirm("Delete ALL event history? This cannot be undone."))return;const r=await fetch("/api/events",{method:"DELETE"});if(r.ok)refresh();else alert("Delete failed")}
$('teamForm').addEventListener('submit',async ev=>{
  ev.preventDefault(); const name=$('teamName').value.trim(); if(!name)return;
  const r=await fetch('/api/teams',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,member_count:Number($('memberCount').value)})});
  const d=await r.json();
  if(!r.ok){alert(d.error||'Could not create team');return}
  $('newTeamCode').classList.remove('hidden');
  $('newTeamCode').innerHTML=`<b>${esc(d.name)}</b> created. Share this code with the selected participants: <strong>${esc(d.code)}</strong><br><small>Keep this code private to the team.</small>`;
  showTeamSetup(d);
  $('teamName').value='';refresh();
});
refresh();setInterval(refresh,3000);

async function showTeamSetup(d){
  const info=await (await fetch('/api/server-info')).json();
  const url=info.lan_url;
  const cmds=Array.from({length:d.member_count||4},(_,i)=>i+1).map(n=>`python agent.py --server ${url} --team-code ${d.code} --laptop-name "${d.name} Laptop ${n}"`);
  $('newTeamCode').innerHTML+=`<div class="setup-box"><b>Laptop setup (copy & run in each laptop's VS Code terminal):</b>
    <p><small>Server URL for other laptops: <strong>${esc(url)}</strong> (only this server laptop should run server.py)</small></p>
    ${cmds.map((c,i)=>`<div class="cmd"><small>Laptop ${i+1}:</small><code>${esc(c)}</code></div>`).join('')}
    <p><small>Chrome extension: Server URL = ${esc(url)}, Team Code = ${esc(d.code)}, Laptop Name = Alpha Laptop 1-4</small></p></div>`;
}

let activityData=null;
function populateActivity(d){activityData=d;const teamSel=$('activityTeam'), laptopSel=$('activityLaptop');if(!teamSel||!laptopSel)return;const current=teamSel.value;teamSel.innerHTML='<option value="">Select a team</option>'+d.teams.map(t=>`<option value="${t.id}">${esc(t.name)}${t.eligible?' · Ready':' · Pending'}</option>`).join('');if(current)teamSel.value=current;refreshLaptopChoices();}
function refreshLaptopChoices(){if(!activityData)return;const tid=$('activityTeam').value,sel=$('activityLaptop');sel.innerHTML='<option value="">Select a member laptop</option>'+activityData.laptops.filter(l=>String(l.team_id)===tid).map(l=>`<option value="${l.id}">${esc(l.name)} (${l.online?'online':'offline'})</option>`).join('');$('memberEvents').innerHTML='';}
$('activityTeam')?.addEventListener('change',refreshLaptopChoices);
$('activityLaptop')?.addEventListener('change',()=>{if(!activityData)return;const id=$('activityLaptop').value;const laptop=activityData.laptops.find(l=>String(l.id)===id);const rows=activityData.events.filter(e=>e.laptop_name===laptop?.name&&e.team_name===laptop?.team_name);$('memberEvents').innerHTML=rows.length?'<table><thead><tr><th>Time</th><th>Event</th><th>Details</th><th>Severity</th></tr></thead><tbody>'+rows.map(e=>`<tr><td>${esc(e.created_at)}</td><td>${esc(e.event_type)}</td><td>${esc(e.detail)}</td><td>${esc(e.severity)}</td></tr>`).join('')+'</tbody></table>':'<div class="empty">No recorded events for this selection.</div>';});
