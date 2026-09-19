const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {projects: [], runtime: {}, voices: {default:'legacy',voices:[]}, presets:{}, tasks:{}, current: null, taskTimer:null, projectFilter:'all', projectQuery:'', segmentPage:0, segmentPageSize:20, segmentQuery:''};
const stages = ['Import','Analyse','Script','TTS','Sync','Review','Export'];

async function api(url, options={}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.detail || data.error || `Erreur ${res.status}`);
  return data;
}
function toast(message, error=false){const el=$('#toast');el.textContent=message;el.className=`toast show${error?' error':''}`;clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='toast',3200)}
function fmt(seconds=0){seconds=Math.round(seconds);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
function fmtEta(seconds){if(seconds==null)return 'ETA —';return `ETA ${fmt(seconds)}`}
function labelStatus(s){return ({draft:'Brouillon',imported:'Importé',analyzed:'Analysé',script_ready:'Script prêt',tts:'Voix générée',review:'À revoir',done:'Terminé'})[s]||s}

function showView(name){$$('.view').forEach(v=>v.classList.remove('active'));$(`#${name}View`).classList.add('active');$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));const titles={home:['ESPACE DE TRAVAIL','Vos projets'],studio:['PRODUCTION','Studio de doublage'],runtime:['SYSTÈME','Runtime local']};$('#eyebrow').textContent=titles[name][0];$('#pageTitle').textContent=titles[name][1];if(name==='studio')renderStudio()}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));

async function loadRuntime(){
  try{[state.runtime,state.voices]=await Promise.all([api('/api/runtime'),api('/api/voices')]);renderRuntime();renderVoiceChoices()}catch(e){toast(e.message,true)}
}
async function loadPresets(){state.presets=await api('/api/export-presets');const select=$('#exportPreset');select.innerHTML=Object.entries(state.presets).map(([id,p])=>`<option value="${id}">${escapeHtml(p.name)}</option>`).join('');select.value='youtube_1080p';renderPresetInfo()}
function renderPresetInfo(){const p=state.presets[$('#exportPreset')?.value];if(p)$('#exportPresetInfo').textContent=p.description}
function renderVoiceChoices(){const html=state.voices.voices.map(v=>`<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');$('#newVoice').innerHTML=html;$('#newVoice').value=state.voices.default;if(state.current){$('#projectVoice').innerHTML=html;$('#projectVoice').value=state.current.voice_id||state.voices.default}}
function renderRuntime(){
  const icons={ffmpeg:'▶',ffprobe:'⌁',yt_dlp:'↓',asr:'≋',tts:'◉'};
  const names={ffmpeg:'FFmpeg',ffprobe:'FFprobe',yt_dlp:'yt-dlp',asr:'Faster-Whisper',tts:'Qwen3-TTS'};
  const rows=Object.entries(state.runtime);const ready=rows.filter(([,x])=>x.ready).length;
  $('#runtimeScore').textContent=`${ready}/${rows.length}`;$('#globalDot').style.background=ready===rows.length?'var(--green)':'var(--yellow)';$('#globalStatus').textContent=ready===rows.length?'Tous les moteurs prêts':`${ready}/${rows.length} moteurs prêts`;
  $('#healthList').innerHTML=rows.map(([k,x])=>`<div class="health-item"><span class="icon">${icons[k]}</span><span><b>${names[k]}</b><small>${x.engine||'Dépendance système'}</small></span><i class="status-dot ${x.ready?'ready':''}"></i></div>`).join('');
  $('#runtimeGrid').innerHTML=rows.map(([k,x])=>`<article class="runtime-card"><div class="section-head"><b>${names[k]}</b><span class="sync-badge ${x.ready?'ideal':''}">${x.ready?'Prêt':'Absent'}</span></div><code>${x.path||x.model||x.python||'Non détecté'}</code>${x.voice?`<code>Voix · ${x.voice}</code>`:''}${x.estimated_minutes_per_hour?`<code>Mesuré · ${x.measured_audio_per_compute}× temps réel · ≈ ${x.estimated_minutes_per_hour} min / heure audio</code>`:''}</article>`).join('');
}

async function loadProjects(){state.projects=await api('/api/projects');renderProjects();if(state.current){const found=state.projects.find(p=>p.id===state.current.id);if(found)state.current=found}}
function renderProjects(){
  const grid=$('#projectGrid');
  if(!state.projects.length){grid.innerHTML='<div class="empty-projects">Aucun projet pour le moment. Lancez votre premier doublage.</div>';return}
  $('#kpiProjects').textContent=state.projects.length;$('#kpiMinutes').textContent=`${Math.round(state.projects.reduce((n,p)=>n+Number(p.duration||0),0)/60)} min`;$('#kpiReady').textContent=state.projects.filter(p=>p.status==='done').length;$('#kpiEngine').textContent=`${String(state.runtime.tts?.measured_audio_per_compute||1.925).replace('.',',')}×`;
  const filtered=state.projects.filter(p=>{const matchesQuery=!state.projectQuery||String(p.title).toLowerCase().includes(state.projectQuery);const matchesFilter=state.projectFilter==='all'||(state.projectFilter==='done'?p.status==='done':p.status!=='done');return matchesQuery&&matchesFilter});
  if(!filtered.length){grid.innerHTML='<div class="empty-projects">Aucun projet ne correspond à cette recherche.</div>';return}
  grid.innerHTML=filtered.map((p,i)=>`<article class="project-card" data-id="${p.id}"><div class="project-cover"><span class="project-index">PROJET ${String(i+1).padStart(2,'0')}</span></div><div class="project-body"><div><span class="project-status ${p.status==='done'?'done':''}">● ${labelStatus(p.status).toUpperCase()}</span><button class="project-open" aria-label="Ouvrir">↗</button></div><h3>${escapeHtml(p.title)}</h3><p>${String(p.source_language||'auto').toUpperCase()} → ${String(p.target_language||'fr').toUpperCase()} · ${fmt(p.duration)}</p><div class="card-foot"><div class="mini-progress"><i style="width:${p.progress||0}%"></i></div><div class="card-meta"><span>${p.segments?.length||0} segments</span><b>${p.progress||0}%</b></div></div></div></article>`).join('');
  $$('.project-card').forEach(card=>card.addEventListener('click',async()=>{state.current=await api(`/api/projects/${card.dataset.id}`);state.tasks=await api(`/api/projects/${card.dataset.id}/tasks`);state.segmentPage=0;state.segmentQuery='';$('#segmentSearch').value='';showView('studio');if(Object.values(state.tasks).some(t=>['queued','running'].includes(t.state)))monitorTasks()}));
}
$('#projectSearch').oninput=e=>{state.projectQuery=e.target.value.trim().toLowerCase();renderProjects()};$$('.chip').forEach((button,index)=>button.onclick=()=>{$$('.chip').forEach(x=>x.classList.remove('active'));button.classList.add('active');state.projectFilter=['all','progress','done'][index]||'all';renderProjects()});
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c])}

function openNew(){$('#projectDialog').showModal();setTimeout(()=>$('#newTitle').focus(),50)}
$('#newProject').onclick=openNew;$('#heroNew').onclick=openNew;
$('#projectForm').addEventListener('submit',async e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();try{state.current=await api('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:$('#newTitle').value,target_language:$('#newLanguage').value,voice_id:$('#newVoice').value})});$('#projectDialog').close();$('#newTitle').value='';await loadProjects();showView('studio');toast('Projet créé')}catch(err){toast(err.message,true)}});

function stageIndex(status){return ({draft:0,imported:1,analyzed:2,script_ready:3,tts:4,review:5,done:6})[status]??0}
function renderStudio(){
  const p=state.current;$('#emptyStudio').hidden=!!p;$('#studioContent').hidden=!p;if(!p)return;
  renderVoiceChoices();
  $('#projectName').textContent=p.title;$('#projectStatus').textContent=labelStatus(p.status).toUpperCase();$('#projectLang').textContent=`${String(p.source_language||'auto').toUpperCase()} → ${String(p.target_language).toUpperCase()}`;$('#projectDuration').textContent=fmt(p.duration);$('#progressLabel').textContent=`${p.progress||0}%`;$('#progressBar').style.width=`${p.progress||0}%`;
  const si=stageIndex(p.status);$('#stagebar').innerHTML=stages.map((s,i)=>`<div class="stage ${i<si?'done':i===si?'current':''}">${i<si?'✓ ':''}${s}</div>`).join('');
  const hasSource=!!p.source;$('#importPanel').hidden=hasSource;$('#segmentsPanel').hidden=!hasSource;
  $('#statSegments').textContent=p.segments?.length||'—';$('#statDuration').textContent=p.duration?fmt(p.duration):'—';$('#statWarnings').textContent=p.segments?.filter(s=>!['ideal','tolerable'].includes(s.sync?.status)).length||0;$('#statTtsEstimate').textContent=p.tts_benchmark?`≈ ${p.tts_benchmark.estimated_minutes_for_one_hour} min`:`≈ ${state.runtime.tts?.estimated_minutes_per_hour||31.2} min`;
  const next=nextStep(p);$('#nextTitle').textContent=next.title;$('#nextCopy').textContent=next.copy;$('#nextAction').textContent=next.action;$('#nextAction').onclick=next.run;
  renderTasks();
  if(hasSource)renderSegments();
}
function renderTasks(){const rows=Object.values(state.tasks||{});const active=rows.filter(t=>['queued','running'].includes(t.state));$('#taskSummary').textContent=active.length?`${active.length} en cours`:rows.length?'À jour':'Aucune';$('#taskList').innerHTML=rows.length?rows.map(t=>`<div class="task-row ${t.state}"><b>${escapeHtml({analyze:'Analyse',tts:'Qwen TTS',export:'Export'}[t.kind]||t.kind)}</b><small>${Math.round(t.progress||0)}% · ${fmtEta(t.eta_seconds)}</small><div class="task-track"><i style="width:${t.progress||0}%"></i></div><div class="task-message">${escapeHtml(t.message||'')} ${t.total?`· ${t.current||0}/${t.total}`:''}${t.error?` · ${escapeHtml(t.error)}`:''}</div></div>`).join(''):'<p>Les étapes apparaîtront ici.</p>'}
async function refreshTasks(){if(!state.current)return;const before=JSON.stringify(state.tasks);state.tasks=await api(`/api/projects/${state.current.id}/tasks`);renderTasks();const active=Object.values(state.tasks).some(t=>['queued','running'].includes(t.state));if(!active&&state.taskTimer){clearInterval(state.taskTimer);state.taskTimer=null;state.current=await api(`/api/projects/${state.current.id}`);await loadProjects();renderStudio();const failed=Object.values(state.tasks).find(t=>t.state==='failed');toast(failed?failed.error||'Une tâche a échoué':'Tâche terminée',!!failed)}else if(before!==JSON.stringify(state.tasks)){renderTasks()}}
function monitorTasks(){refreshTasks().catch(e=>toast(e.message,true));if(!state.taskTimer)state.taskTimer=setInterval(()=>refreshTasks().catch(e=>toast(e.message,true)),1000)}
async function startTask(kind,payload={}){await api(`/api/projects/${state.current.id}/tasks/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});monitorTasks();toast(`${{analyze:'Analyse',tts:'Génération Qwen',export:'Export'}[kind]} lancée en arrière-plan`)}
function nextStep(p){
  if(p.status==='imported')return{title:'Analyser la vidéo',copy:'Extraction audio, ASR et segmentation visuelle locale.',action:'Lancer l’analyse',run:analyze};
  if(p.status==='analyzed')return{title:'Réécrire le script',copy:'Exportez le pack JSON, réécrivez-le avec ChatGPT puis réimportez-le.',action:'Exporter le pack',run:downloadPack};
  if(p.status==='script_ready')return{title:'Générer les voix',copy:'Qwen accéléré traite tout le lot avec progression et ETA.',action:'Tout générer',run:generateAll};
  if(p.status==='tts')return{title:'Compléter les voix',copy:'Générez les segments restants puis résolvez la timeline.',action:'Compléter le lot',run:generateAll};
  if(p.status==='review')return{title:'Vérifier et exporter',copy:'Corrigez les alertes de durée avant l’encodage final.',action:'Exporter MP4',run:exportVideo};
  if(p.status==='done')return{title:'Export terminé',copy:'Le dernier rendu est prêt dans le dossier export du projet.',action:'Nettoyage rapide',run:cleanup};
  return{title:'Importer une vidéo',copy:'Ajoutez un fichier local ou une URL YouTube.',action:'Choisir un fichier',run:()=>$('#videoFile').click()};
}
function renderSegments(){
  const p=state.current, list=$('#segmentList');
  if(!p.segments?.length){list.innerHTML=`<div class="empty-projects">La source est prête. Lancez l'analyse pour construire la timeline.</div>`;return}
  const query=state.segmentQuery.toLowerCase();
  const filtered=p.segments.filter(s=>!query||`${s.id} ${s.rewritten_text||''} ${s.transcript||''}`.toLowerCase().includes(query));
  const pages=Math.max(1,Math.ceil(filtered.length/state.segmentPageSize));
  state.segmentPage=Math.min(state.segmentPage,pages-1);
  const visible=filtered.slice(state.segmentPage*state.segmentPageSize,(state.segmentPage+1)*state.segmentPageSize);
  $('#segmentPageLabel').textContent=`${state.segmentPage+1} / ${pages}`;$('#prevSegments').disabled=state.segmentPage===0;$('#nextSegments').disabled=state.segmentPage>=pages-1;
  if(!visible.length){list.innerHTML='<div class="empty-projects">Aucun segment ne correspond à cette recherche.</div>';return}
  list.innerHTML=visible.map(s=>{const words=(s.rewritten_text||'').trim().split(/\s+/).filter(Boolean).length,budget=s.script_word_budget||Math.max(1,Math.floor(Number(s.original_duration)*2.2));return `<article class="segment" data-id="${s.id}" data-budget="${budget}">${s.frame?`<img loading="lazy" src="/api/projects/${p.id}/frames/${s.frame}" alt="Frame ${s.id}">`:'<div></div>'}<div><textarea placeholder="Écrivez la narration française…">${escapeHtml(s.rewritten_text||'')}</textarea><div class="segment-budget"><span class="${words>budget?'budget-over':'budget-ok'}">${words}/${budget} mots recommandés</span><span>${fmt(s.video_start)} → ${fmt(s.video_end)}</span></div><p class="original">SOURCE · ${escapeHtml(s.transcript||'Transcription non disponible')}</p></div><div class="segment-side"><div class="timebox"><span>VIDÉO</span><span>AUDIO QWEN</span><b>${Number(s.original_duration).toFixed(1)}s</b><b>${s.tts_duration?Number(s.tts_duration).toFixed(1)+'s':'—'}</b></div><span class="sync-badge ${s.sync?.status||''}">${(s.sync?.status||'à générer').replaceAll('_',' ')}</span><button class="secondary save-seg">Enregistrer</button><button class="primary tts-seg">${s.tts_path?'Régénérer':'Générer TTS'}</button>${s.tts_path?`<button class="ghost play-seg">▶ Écouter</button>`:''}</div></article>`}).join('');
  $$('.save-seg').forEach(b=>b.onclick=()=>saveSegment(b.closest('.segment')));$$('.tts-seg').forEach(b=>b.onclick=()=>generateSegment(b.closest('.segment')));$$('.play-seg').forEach(b=>b.onclick=()=>new Audio(`/api/projects/${p.id}/audio/${b.closest('.segment').dataset.id}?t=${Date.now()}`).play());
  $$('.segment textarea').forEach(area=>area.oninput=()=>{const card=area.closest('.segment'),budget=Number(card.dataset.budget),words=area.value.trim().split(/\s+/).filter(Boolean).length,label=card.querySelector('.segment-budget span');label.textContent=`${words}/${budget} mots recommandés`;label.className=words>budget?'budget-over':'budget-ok'});
}
$('#segmentSearch').oninput=e=>{state.segmentQuery=e.target.value.trim();state.segmentPage=0;renderSegments()};$('#prevSegments').onclick=()=>{if(state.segmentPage>0){state.segmentPage--;renderSegments();scrollTo({top:0,behavior:'smooth'})}};$('#nextSegments').onclick=()=>{state.segmentPage++;renderSegments();scrollTo({top:0,behavior:'smooth'})};
async function saveSegment(el){try{const s=await api(`/api/projects/${state.current.id}/segments/${el.dataset.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({rewritten_text:el.querySelector('textarea').value})});Object.assign(state.current.segments.find(x=>x.id===s.id),s);toast('Segment enregistré')}catch(e){toast(e.message,true)}}
async function generateSegment(el){const btn=el.querySelector('.tts-seg');btn.disabled=true;btn.textContent='Qwen travaille…';try{await saveSegment(el);const s=await api(`/api/projects/${state.current.id}/segments/${el.dataset.id}/tts`,{method:'POST'});Object.assign(state.current.segments.find(x=>x.id===s.id),s);state.current.status='tts';state.current.progress=Math.max(68,state.current.progress||0);renderStudio();toast('Narration générée')}catch(e){toast(e.message,true);btn.disabled=false;btn.textContent='Générer TTS'}}
async function generateNext(){const target=$$('.segment').find(el=>!state.current.segments.find(s=>s.id===el.dataset.id).tts_path);if(target)return generateSegment(target);toast('Tous les segments ont déjà une narration')}

$('#videoFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;busy('#dropzone strong','Import en cours…');try{state.current=await api(`/api/projects/${state.current.id}/source`,{method:'POST',headers:{'X-Filename':encodeURIComponent(file.name)},body:file});await loadProjects();renderStudio();toast('Vidéo importée')}catch(err){toast(err.message,true)}finally{busy('#dropzone strong','Déposez une vidéo ici')}};
$('#urlImport').onclick=async()=>{const url=$('#videoUrl').value.trim();if(!url)return;const b=$('#urlImport');b.disabled=true;b.textContent='Téléchargement…';try{state.current=await api(`/api/projects/${state.current.id}/source-url`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});await loadProjects();renderStudio();toast('Vidéo téléchargée')}catch(e){toast(e.message,true)}finally{b.disabled=false;b.textContent='Importer l’URL'}};
function busy(sel,text){const e=$(sel);if(e)e.textContent=text}
async function analyze(){try{await startTask('analyze')}catch(e){toast(e.message,true)}}
function downloadPack(){window.location.href=`/api/projects/${state.current.id}/script-pack`}
$('#downloadPack').onclick=downloadPack;
async function generateAll(){try{await startTask('tts')}catch(e){toast(e.message,true)}}
$('#generateAllBtn').onclick=generateAll;
$('#scriptFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const payload=JSON.parse(await f.text());state.current=await api(`/api/projects/${state.current.id}/script`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await loadProjects();renderStudio();toast('Script réimporté')}catch(err){toast(err.message,true)}};
$('#solveBtn').onclick=async()=>{try{state.current=await api(`/api/projects/${state.current.id}/solve`,{method:'POST'});await loadProjects();renderStudio();toast('Timeline résolue')}catch(e){toast(e.message,true)}};
async function cleanup(){try{const r=await api(`/api/projects/${state.current.id}/cleanup`,{method:'POST'});toast(`${r.removed} élément(s) de cache supprimé(s)`)}catch(e){toast(e.message,true)}}
$('#cleanupBtn').onclick=cleanup;
$('#projectVoice').onchange=async e=>{try{state.current=await api(`/api/projects/${state.current.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice_id:e.target.value})});toast('Voix Qwen sélectionnée')}catch(err){toast(err.message,true)}};
async function exportVideo(){if(!confirm('Lancer l’encodage MP4 final ?'))return;try{await startTask('export',{preset:$('#exportPreset').value})}catch(e){toast(e.message,true)}}
$('#exportNowBtn').onclick=exportVideo;$('#exportPreset').onchange=renderPresetInfo;
$('#refreshRuntime').onclick=()=>{loadRuntime();toast('Diagnostic actualisé')};

(async function init(){await Promise.all([loadRuntime(),loadProjects(),loadPresets()]);})();
