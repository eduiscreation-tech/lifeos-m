const CFG = window.LIFEOS_CONFIG;
const SEED = window.LIFEOS_SEED;
const LS = {
  tasks:"lifeos_m_tasks_v01", logs:"lifeos_m_logs_v01",
  api:"lifeos_m_api_url", token:"lifeos_m_api_token", active:"lifeos_m_active_timer"
};
const STATUS = ["미완료","진행중","완료","보류","위임","취소"];
const NAV = [
  ["today","오늘","⌂"],["tasks","할 일","✓"],["buy","구매","🛒"],
  ["schedule","일정","◷"],["logs","기록","◉"],["settings","설정","⚙"]
];
let state = {
  page:"today", filter:"미완료",
  tasks: loadJSON(LS.tasks, SEED.tasks), logs:loadJSON(LS.logs, SEED.logs),
  visibleIds:[], apiUrl:localStorage.getItem(LS.api) || CFG.defaultApiUrl || "",
  apiToken:localStorage.getItem(LS.token) || "",
  active:loadJSON(LS.active, null)
};

function loadJSON(k, fallback){ try { const v=localStorage.getItem(k); return v?JSON.parse(v):structuredClone(fallback); } catch { return structuredClone(fallback); } }
function saveLocal(){ localStorage.setItem(LS.tasks,JSON.stringify(state.tasks)); localStorage.setItem(LS.logs,JSON.stringify(state.logs)); localStorage.setItem(LS.active,JSON.stringify(state.active)); }
function todayISO(){ return new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"}); }
function nowISO(){ return new Date().toISOString(); }
function escapeHTML(s=""){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function formatDue(v){ if(!v)return ""; const d=new Date(v); if(Number.isNaN(d.getTime())) return v; return new Intl.DateTimeFormat("ko-KR",{month:"numeric",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit"}).format(d); }
function isOpen(t){ return !["완료","취소"].includes(t.status); }
function sortTasks(a,b){ return (Number(a.sort_order)||99999)-(Number(b.sort_order)||99999); }

function navHTML(){
  return NAV.map(([id,label,icon])=>`<button class="nav-btn ${state.page===id?"active":""}" data-nav="${id}">${icon}<br class="mobile-only">${label}</button>`).join("");
}
function bindNav(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>{ state.page=b.dataset.nav; render(); });
}
function setTitle(t){ document.getElementById("pageTitle").textContent=t; }

function taskCard(t, n, compact=false){
  const meta=[t.status,t.area,t.type,t.list].filter(Boolean).map(x=>`<span class="tag status-${escapeHTML(x)}">${escapeHTML(x)}</span>`).join("");
  const due=t.due_at?`<span class="tag">${escapeHTML(formatDue(t.due_at))}</span>`:"";
  const del=t.delegate?`<span class="tag">→ ${escapeHTML(t.delegate)}</span>`:"";
  return `<div class="card">
    <div class="task-row">
      <div class="num">${n}</div>
      <div>
        <div class="task-title">${escapeHTML(t.title)}</div>
        <div class="meta">${meta}${due}${del}</div>
        ${t.note?`<div class="sub" style="margin-top:7px">${escapeHTML(t.note)}</div>`:""}
        ${compact?"":`<div class="actions">
          ${t.status!=="완료"?`<button class="done" data-act="완료" data-id="${t.id}">완료</button>`:""}
          ${t.status!=="보류"?`<button class="hold" data-act="보류" data-id="${t.id}">보류</button>`:""}
          <button class="ghost" data-act="진행중" data-id="${t.id}">진행</button>
          <button class="edit" data-edit="${t.id}">수정</button>
        </div>`}
      </div>
      <button class="ghost" data-edit="${t.id}" style="padding:6px 9px">⋯</button>
    </div>
  </div>`;
}

function renderToday(){
  setTitle("오늘");
  const open = state.tasks.filter(t=>isOpen(t)&&t.type!=="일정").sort(sortTasks);
  const doneToday = state.tasks.filter(t=>t.completed_at===todayISO()).length;
  const schedule = state.tasks.filter(t=>t.type==="일정" && isOpen(t)).sort((a,b)=>(a.due_at||"").localeCompare(b.due_at||""));
  const focus = open.filter(t=>t.status==="진행중");
  const shown = [...focus, ...open.filter(t=>t.status==="미완료")].slice(0,8);
  state.visibleIds = shown.map(t=>t.id);
  const timer = timerHTML();
  return `
    <div class="summary-grid">
      <div class="stat"><strong>${open.filter(t=>t.status==="미완료").length}</strong><span>미완료</span></div>
      <div class="stat"><strong>${doneToday}</strong><span>오늘 완료</span></div>
      <div class="stat"><strong>${state.tasks.filter(t=>t.status==="보류").length}</strong><span>보류</span></div>
      <div class="stat"><strong>${state.tasks.filter(t=>t.status==="위임").length}</strong><span>위임</span></div>
    </div>
    ${timer}
    <div class="section-title"><h2>지금 할 일</h2><button class="ghost" id="newTaskBtn">+ 추가</button></div>
    ${shown.length?shown.map((t,i)=>taskCard(t,i+1)).join(""):`<div class="empty">미완료 할 일이 없어.</div>`}
    <div class="section-title"><h2>다가오는 일정</h2></div>
    ${schedule.slice(0,4).map(t=>`<div class="card"><div class="schedule-time">${escapeHTML(formatDue(t.due_at))}</div><div class="task-title">${escapeHTML(t.title)}</div></div>`).join("") || `<div class="empty">등록된 일정이 없어.</div>`}`;
}

function renderTasks(){
  setTitle("할 일");
  const filters=["미완료","진행중","보류","위임","완료","전체"];
  let list=state.tasks.filter(t=>t.type==="할일");
  if(state.filter!=="전체") list=list.filter(t=>t.status===state.filter);
  list.sort(sortTasks);
  state.visibleIds=list.map(t=>t.id);
  return `<div class="filters">${filters.map(f=>`<button class="filter ${state.filter===f?"active":""}" data-filter="${f}">${f}</button>`).join("")}</div>
    ${list.length?list.map((t,i)=>taskCard(t,i+1)).join(""):`<div class="empty">항목이 없어.</div>`}`;
}

function renderBuy(){
  setTitle("구매");
  const list=state.tasks.filter(t=>t.type==="구매" && t.status!=="완료" && t.status!=="취소").sort(sortTasks);
  state.visibleIds=list.map(t=>t.id);
  const groups=[...new Set(list.map(t=>t.list||"일반"))];
  return groups.map(g=>`<div class="list-group"><h3>${escapeHTML(g)}</h3>${list.filter(t=>(t.list||"일반")===g).map((t)=>taskCard(t,state.visibleIds.indexOf(t.id)+1)).join("")}</div>`).join("") || `<div class="empty">구매할 것이 없어.</div>`;
}

function renderSchedule(){
  setTitle("일정");
  const list=state.tasks.filter(t=>t.type==="일정" && t.status!=="취소").sort((a,b)=>(a.due_at||"").localeCompare(b.due_at||""));
  state.visibleIds=list.map(t=>t.id);
  return list.map((t,i)=>`<div class="card"><div class="schedule-time">${escapeHTML(formatDue(t.due_at))}</div>${taskCard(t,i+1,true).replace(/^<div class="card">|<\/div>$/g,"")}</div>`).join("") || `<div class="empty">일정이 없어.</div>`;
}

function renderLogs(){
  setTitle("기록");
  state.visibleIds=[];
  const total=state.logs.reduce((s,l)=>s+(Number(l.duration_min)||0),0);
  return `${timerHTML()}
    <div class="summary-grid">
      <div class="stat"><strong>${Math.floor(total/60)}h ${total%60}m</strong><span>누적 기록</span></div>
      <div class="stat"><strong>${state.logs.length}</strong><span>로그</span></div>
      <div class="stat"><strong>${state.active?"ON":"OFF"}</strong><span>현재 타이머</span></div>
    </div>
    ${[...state.logs].reverse().map(l=>`<div class="card"><div class="task-title">${escapeHTML(l.activity)}</div><div class="meta"><span class="tag">${Number(l.duration_min)||0}분</span><span class="tag">${escapeHTML(l.category||"")}</span></div><div class="sub">${escapeHTML(l.note||"")}</div></div>`).join("")}`;
}

function renderSettings(){
  setTitle("설정");
  state.visibleIds=[];
  return `<div class="card">
    <div class="task-title">Google Sheet 동기화</div>
    <p class="sub">현재 데이터 원본: LIFEOS_M_DATA</p>
    <div class="meta"><span class="tag">${(state.apiUrl&&state.apiToken)?"연결 정보 저장됨":"아직 로컬 모드"}</span></div>
    <div class="actions">
      <button id="openSettings">연결 설정</button>
      <button class="ghost" id="syncNow">지금 동기화</button>
      <a href="${CFG.spreadsheetUrl}" target="_blank"><button type="button" class="ghost">Sheet 열기</button></a>
    </div>
  </div>
  <div class="card"><div class="task-title">데이터</div><p class="sub">할 일 ${state.tasks.length}개 · 로그 ${state.logs.length}개</p>
  <div class="actions"><button class="ghost" id="exportJson">JSON 백업</button><button class="ghost" id="resetSeed">초기 데이터로 복구</button></div></div>`;
}

function timerHTML(){
  if(!state.active) return `<div class="timer-card"><div class="timer-line"><div><div class="sub" style="color:#94a3b8">현재 활동</div><strong>진행 중인 활동 없음</strong></div><button class="ghost" data-start-timer="집중">집중 시작</button></div></div>`;
  return `<div class="timer-card"><div class="timer-line"><div><div class="sub" style="color:#94a3b8">현재 활동</div><strong>${escapeHTML(state.active.activity)}</strong></div><div><div class="timer-time" id="timerTime">00:00:00</div><button class="ghost" id="stopTimer">종료</button></div></div></div>`;
}

function render(){
  document.getElementById("desktopNav").innerHTML=navHTML();
  document.getElementById("bottomNav").innerHTML=navHTML();
  const now=new Date();
  document.getElementById("todayLabel").textContent=new Intl.DateTimeFormat("ko-KR",{dateStyle:"full"}).format(now);
  let html="";
  if(state.page==="today") html=renderToday();
  else if(state.page==="tasks") html=renderTasks();
  else if(state.page==="buy") html=renderBuy();
  else if(state.page==="schedule") html=renderSchedule();
  else if(state.page==="logs") html=renderLogs();
  else html=renderSettings();
  document.getElementById("view").innerHTML=html;
  document.getElementById("syncState").textContent=(state.apiUrl&&state.apiToken)?"Sheet 연결":"로컬";
  bindNav(); bindDynamic();
}

function bindDynamic(){
  document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;render();});
  document.querySelectorAll("[data-act]").forEach(b=>b.onclick=()=>patchTask(b.dataset.id,{status:b.dataset.act}));
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openEdit(b.dataset.edit));
  document.querySelectorAll("[data-start-timer]").forEach(b=>b.onclick=()=>startTimer(b.dataset.startTimer));
  const n=document.getElementById("newTaskBtn"); if(n)n.onclick=()=>openEdit("");
  const s=document.getElementById("stopTimer"); if(s)s.onclick=()=>stopTimer();
  const os=document.getElementById("openSettings"); if(os)os.onclick=openSettings;
  const sn=document.getElementById("syncNow"); if(sn)sn.onclick=syncPull;
  const ex=document.getElementById("exportJson"); if(ex)ex.onclick=exportJSON;
  const rs=document.getElementById("resetSeed"); if(rs)rs.onclick=resetSeed;
  tickTimer();
}

async function patchTask(id, patch){
  const t=state.tasks.find(x=>x.id===id); if(!t)return;
  Object.assign(t,patch);
  if(patch.status==="완료") t.completed_at=todayISO();
  else if(patch.status && patch.status!=="완료") t.completed_at="";
  saveLocal(); render();
  if(state.apiUrl && state.apiToken) await apiPost({action:"patchTask",id,patch:{...patch,completed_at:t.completed_at}});
}
function nextLocalId(){
  const max=Math.max(0,...state.tasks.map(t=>Number((t.id||"").replace(/\D/g,""))||0));
  return "T"+String(max+1).padStart(4,"0");
}
async function addTask(data){
  const t={id:nextLocalId(),title:data.title,status:data.status||"미완료",area:data.area||"기타",type:data.type||"할일",list:data.list||"일반",created_at:todayISO(),due_at:data.due_at||"",completed_at:"",delegate:data.delegate||"",note:data.note||"",sort_order:state.tasks.length+1};
  state.tasks.push(t); saveLocal(); render();
  if(state.apiUrl && state.apiToken){
    const r=await apiPost({action:"addTask",task:t});
    if(r && r.task && r.task.id){ Object.assign(t,r.task); saveLocal(); render(); }
  }
}

function openEdit(id){
  const t=state.tasks.find(x=>x.id===id);
  document.getElementById("dialogTitle").textContent=t?"항목 수정":"새 항목";
  document.getElementById("editId").value=t?.id||"";
  document.getElementById("editTitle").value=t?.title||"";
  document.getElementById("editStatus").innerHTML=STATUS.map(s=>`<option ${t?.status===s?"selected":""}>${s}</option>`).join("");
  document.getElementById("editArea").value=t?.area||"";
  document.getElementById("editType").value=t?.type||"할일";
  document.getElementById("editList").value=t?.list||"일반";
  document.getElementById("editDue").value=t?.due_at?String(t.due_at).slice(0,16):"";
  document.getElementById("editDelegate").value=t?.delegate||"";
  document.getElementById("editNote").value=t?.note||"";
  document.getElementById("taskDialog").showModal();
}
document.getElementById("saveEdit").onclick=async(e)=>{
  e.preventDefault();
  const id=document.getElementById("editId").value;
  const data={title:document.getElementById("editTitle").value.trim(),status:document.getElementById("editStatus").value,area:document.getElementById("editArea").value.trim()||"기타",type:document.getElementById("editType").value,list:document.getElementById("editList").value.trim()||"일반",due_at:document.getElementById("editDue").value,delegate:document.getElementById("editDelegate").value.trim(),note:document.getElementById("editNote").value.trim()};
  if(!data.title)return;
  document.getElementById("taskDialog").close();
  if(id) await patchTask(id,data); else await addTask(data);
};

async function handleQuick(raw){
  const q=raw.trim(); if(!q)return;
  let m=q.match(/^(\d+)\s*(완|완료|보류|진행|진행중|취소)(?:\s+(.*))?$/);
  if(m){
    const id=state.visibleIds[Number(m[1])-1];
    if(!id) return toast("현재 화면에 그 번호가 없어.");
    const map={완:"완료",완료:"완료",보류:"보류",진행:"진행중",진행중:"진행중",취소:"취소"};
    await patchTask(id,{status:map[m[2]]}); return;
  }
  m=q.match(/^(\d+)\s*위임(?:\s+(.*))?$/);
  if(m){
    const id=state.visibleIds[Number(m[1])-1]; if(!id)return toast("현재 화면에 그 번호가 없어.");
    await patchTask(id,{status:"위임",delegate:m[2]||""}); return;
  }
  m=q.match(/^(.+)\s+(시작)$/);
  if(m && ["청소","운동","집중","휴식","정리","공부"].some(x=>m[1].includes(x))){ startTimer(m[1]); return; }
  m=q.match(/^(.+)\s+(끝|종료)$/);
  if(m && state.active){ stopTimer(); return; }
  if(q.startsWith("다이소 ")){ await addTask({title:q.slice(4).trim(),type:"구매",list:"다이소",area:"집"}); return; }
  if(q.startsWith("대전집 ")){ await addTask({title:q.slice(4).trim(),type:"구매",list:"대전집",area:"대전집"}); return; }
  if(q.startsWith("구매:")){ await addTask({title:q.slice(3).trim(),type:"구매",list:"일반"}); return; }
  await addTask({title:q});
}
document.getElementById("quickAdd").onclick=()=>{ const i=document.getElementById("quickInput"); handleQuick(i.value); i.value=""; };
document.getElementById("quickInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();document.getElementById("quickAdd").click();}});

function startTimer(activity){
  state.active={activity,start_at:nowISO()}; saveLocal(); render();
}
async function stopTimer(){
  if(!state.active)return;
  const start=new Date(state.active.start_at), end=new Date();
  const mins=Math.max(1,Math.round((end-start)/60000));
  const log={id:"L"+String(state.logs.length+1).padStart(4,"0"),activity:state.active.activity,start_at:state.active.start_at,end_at:end.toISOString(),duration_min:mins,category:"활동",note:""};
  state.logs.push(log); state.active=null; saveLocal(); render();
  if(state.apiUrl && state.apiToken) await apiPost({action:"addLog",log});
}
function tickTimer(){
  const el=document.getElementById("timerTime"); if(!el||!state.active)return;
  const sec=Math.max(0,Math.floor((Date.now()-new Date(state.active.start_at).getTime())/1000));
  const h=String(Math.floor(sec/3600)).padStart(2,"0"),m=String(Math.floor(sec%3600/60)).padStart(2,"0"),s=String(sec%60).padStart(2,"0");
  el.textContent=`${h}:${m}:${s}`; setTimeout(tickTimer,1000);
}

function openSettings(){
  document.getElementById("apiUrlInput").value=state.apiUrl;
  document.getElementById("apiTokenInput").value=state.apiToken;
  document.getElementById("settingsDialog").showModal();
}
document.getElementById("saveSettings").onclick=async(e)=>{
  e.preventDefault();
  state.apiUrl=document.getElementById("apiUrlInput").value.trim();
  state.apiToken=document.getElementById("apiTokenInput").value.trim();
  localStorage.setItem(LS.api,state.apiUrl);
  localStorage.setItem(LS.token,state.apiToken);
  document.getElementById("settingsDialog").close(); render();
  if(state.apiUrl && state.apiToken) await syncPull();
};
document.getElementById("syncBtnDesktop").onclick=()=>state.apiUrl?syncPull():openSettings();

async function apiGet(){
  const url=new URL(state.apiUrl);
  url.searchParams.set("action","snapshot"); url.searchParams.set("token",state.apiToken);
  const r=await fetch(url.toString(),{cache:"no-store"}); return r.json();
}
async function apiPost(payload){
  try{
    const r=await fetch(state.apiUrl,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({token:state.apiToken,...payload})});
    return await r.json();
  }catch(err){ console.warn(err); toast("Sheet 반영 확인 필요"); return null; }
}
async function syncPull(){
  if(!state.apiUrl || !state.apiToken)return openSettings();
  document.getElementById("syncState").textContent="동기화 중…";
  try{
    const data=await apiGet();
    if(data.ok){
      state.tasks=data.tasks||[]; state.logs=data.logs||[];
      saveLocal(); render(); toast("동기화 완료");
    } else toast(data.error||"동기화 실패");
  } catch(e){ console.warn(e); toast("동기화 실패 · 로컬 데이터 유지"); render(); }
}

function exportJSON(){
  const blob=new Blob([JSON.stringify({tasks:state.tasks,logs:state.logs},null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`lifeos_m_${todayISO()}.json`; a.click(); URL.revokeObjectURL(a.href);
}
function resetSeed(){
  if(!confirm("현재 로컬 데이터를 초기값으로 되돌릴까?"))return;
  state.tasks=structuredClone(SEED.tasks); state.logs=structuredClone(SEED.logs); state.active=null; saveLocal(); render();
}
function toast(msg){
  const d=document.createElement("div"); d.textContent=msg; Object.assign(d.style,{position:"fixed",top:"14px",left:"50%",transform:"translateX(-50%)",background:"#0f172a",color:"white",padding:"9px 13px",borderRadius:"10px",zIndex:999,fontSize:"13px",boxShadow:"0 6px 30px rgba(0,0,0,.2)"});
  document.body.appendChild(d); setTimeout(()=>d.remove(),2200);
}

if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
render();
if(state.apiUrl && state.apiToken) syncPull();
