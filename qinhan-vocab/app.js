(function(){
'use strict';

/* ================= 可调参数 ================= */
const N = 50;            // 新一轮的题数
const MASTER = 2;        // 错题本里连续答对几次算掌握（要和 schema.sql 里的数字一致）
const BASE = 10;         // 答对一题的基础奖金（元）
const STEP = 2;          // 连对每多一题，额外加多少
const STEP_MAX = 10;     // 额外加成最多叠加几次（2 × 10 = 最多再加 20）
const PERFECT = 100;     // 新一轮 50 题全对的额外奖励

/* ================= 工具 ================= */
const $ = s => document.querySelector(s);
const CFG = window.APP_CONFIG || {};
const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function sample(a,n){
  if(a.length<=n) return shuffle(a.slice());
  const c=a.slice();
  for(let i=0;i<n;i++){ const j=i+Math.floor(Math.random()*(c.length-i)); const t=c[i]; c[i]=c[j]; c[j]=t; }
  return c.slice(0,n);
}
let toastTimer=null;
function toast(msg){
  const e=$('#toast'); e.textContent=msg; e.classList.add('on');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>e.classList.remove('on'),2800);
}
function el(tag,cls,text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function fmt(n){ return '¥'+Number(n||0).toLocaleString('en-US'); }
function reward(streak){ return BASE+Math.min(streak-1,STEP_MAX)*STEP; }
const SPK_SVG='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';

const APP_NAME = CFG.APP_NAME || '词汇测验';
document.title = APP_NAME;
$('#brandName').textContent = APP_NAME;
$('#footName').textContent = APP_NAME;

/* ================= 词库 ================= */
const WORDS = RAW.map((r,i)=>({i:i, k:r[0], w:r[0], p:r[1], t:r[2], m:r[3], full:(r[2]+' '+r[3]).replace(/\s+/g,' ').trim()}));
const wmap = new Map(WORDS.map(x=>[x.k,x]));
const byPos = {};
WORDS.forEach(x=>{ (byPos[x.t] = byPos[x.t] || []).push(x); });
document.querySelectorAll('.total').forEach(e=>e.textContent=WORDS.length);
document.querySelectorAll('#home .n-total').forEach(e=>e.textContent=N);

/* ================= 本机偏好（音效、自动朗读、主题只存在本机） ================= */
const PREF_KEY='qinhan-prefs-v2';
const pref={sound:true,auto:false,theme:null};
try{ Object.assign(pref,JSON.parse(localStorage.getItem(PREF_KEY)||'{}')); }catch(e){}
function savePref(){ try{ localStorage.setItem(PREF_KEY,JSON.stringify(pref)); }catch(e){} }

function applyTheme(){ if(pref.theme) document.documentElement.setAttribute('data-theme',pref.theme); }
applyTheme();
$('#btnTheme').addEventListener('click',()=>{
  const cur=document.documentElement.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  pref.theme = cur==='dark' ? 'light' : 'dark';
  applyTheme(); savePref();
});

/* ================= 音效（WebAudio 合成，青铜钟风格） ================= */
let ac=null;
function ctx(){
  if(!ac){ const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null; try{ ac=new AC(); }catch(e){ return null; } }
  if(ac.state==='suspended') ac.resume();
  return ac;
}
function bell(freq,at,vol,dur){
  const c=ctx(); if(!c||!pref.sound) return;
  const t0=c.currentTime+at;
  const parts=[[1,1],[2.01,.38],[2.76,.2],[4.1,.09]];
  parts.forEach(function(pr){
    const o=c.createOscillator(), g=c.createGain();
    o.type='sine'; o.frequency.value=freq*pr[0];
    const peak=vol*pr[1], end=t0+dur/(1+(pr[0]-1)*.6);
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.exponentialRampToValueAtTime(peak,t0+.008);
    g.gain.exponentialRampToValueAtTime(0.0001,end);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(end+.05);
  });
}
function thud(freq,at,vol,dur){
  const c=ctx(); if(!c||!pref.sound) return;
  const t0=c.currentTime+at;
  const o=c.createOscillator(), f=c.createBiquadFilter(), g=c.createGain();
  o.type='triangle'; o.frequency.setValueAtTime(freq,t0); o.frequency.exponentialRampToValueAtTime(freq*.82,t0+dur);
  f.type='lowpass'; f.frequency.value=950;
  g.gain.setValueAtTime(0.0001,t0);
  g.gain.exponentialRampToValueAtTime(vol,t0+.015);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  o.connect(f); f.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0+dur+.05);
}
const sfx={
  start(){ bell(523.25,0,.2,1.4); bell(783.99,.1,.14,1.3); },
  right(){ bell(783.99,0,.2,1.2); bell(1046.5,.09,.18,1.2); bell(1318.5,.18,.15,1.5); },
  wrong(){ thud(246.94,0,.26,.34); thud(196,.17,.26,.5); },
  finish(ratio){
    if(ratio>=0.6){ [523.25,659.25,783.99,1046.5,1318.5,1568].forEach((f,k)=>bell(f,k*.13,.17,1.6)); }
    else{ [392,523.25,659.25].forEach((f,k)=>bell(f,k*.2,.16,1.5)); }
  }
};
function syncSoundBtn(){
  const b=$('#btnSound'); b.classList.toggle('off',!pref.sound); b.setAttribute('aria-pressed',String(pref.sound));
}
$('#btnSound').addEventListener('click',()=>{
  pref.sound=!pref.sound; syncSoundBtn(); savePref();
  if(pref.sound) bell(659.25,0,.18,1);
});
syncSoundBtn();

/* ================= 语音朗读 ================= */
const canSpeak='speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let voice=null;
function pickVoice(){
  if(!canSpeak) return;
  const vs=speechSynthesis.getVoices(); if(!vs.length) return;
  const us=vs.filter(v=>/^en[-_]US/i.test(v.lang));
  const prefer=['Google US English','Samantha','Microsoft Aria','Microsoft Jenny','Microsoft Zira','Alex'];
  let found=null;
  for(const n of prefer){ found=us.find(v=>v.name.indexOf(n)>-1); if(found) break; }
  voice=found||us[0]||vs.find(v=>/^en/i.test(v.lang))||null;
}
if(canSpeak){ pickVoice(); speechSynthesis.onvoiceschanged=pickVoice; }
function speak(text,btn){
  if(!canSpeak){ toast('这个浏览器不支持语音朗读，可以换 Chrome、Edge 或 Safari'); return; }
  try{ speechSynthesis.cancel(); }catch(e){}
  setTimeout(function(){
    const u=new SpeechSynthesisUtterance(text);
    u.lang='en-US'; u.rate=.85; if(voice) u.voice=voice;
    if(btn){ btn.classList.add('talking'); u.onend=()=>btn.classList.remove('talking'); }
    u.onerror=function(){ if(btn) btn.classList.remove('talking'); toast('朗读失败，请检查设备是否安装了英语语音'); };
    speechSynthesis.speak(u);
  },30);
}

/* ================= 云端数据（Supabase） ================= */
const configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) &&
  !/YOUR-/i.test(String(CFG.SUPABASE_URL)+String(CFG.SUPABASE_ANON_KEY));
let sb=null;
if(configured && window.supabase && window.supabase.createClient){
  try{ sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY); }catch(e){ console.error(e); }
}

let user=null;                 // 当前登录用户
let loadedFor=null, loadingFor=null;
let profile=blankProfile();    // 奖金统计
let prog=new Map();            // 单词进度：word -> {seen,right,wrong,streak,wb,last}
let queue=[];                  // 还没成功上传的操作（断网时先存着）
let flushing=false;

function blankProfile(){ return {wallet:0,best_money:0,best_score:0,rounds:0}; }

function zhError(e){
  const m=String((e&&e.message)||e||'');
  if(/Invalid login credentials/i.test(m)) return '邮箱或密码不对';
  if(/Email not confirmed/i.test(m)) return '邮箱还没验证，请先点邮件里的确认链接';
  if(/already registered/i.test(m)) return '这个邮箱已经注册过了，请直接登录';
  if(/at least 6/i.test(m)) return '密码至少 6 位';
  if(/rate limit|too many|security purposes/i.test(m)) return '操作太频繁了，请过几分钟再试';
  if(/valid email|invalid email|email address.*invalid/i.test(m)) return '邮箱格式不对';
  if(/signups? (not allowed|disabled)/i.test(m)) return '后台关闭了注册功能';
  if(/failed to fetch|network|load failed/i.test(m)) return '网络连接失败，请检查网络后重试';
  return m||'出错了，请稍后再试';
}

/* ---- 同步状态小圆点 ---- */
function setSync(state){
  const d=$('#sync');
  d.hidden=!user;
  d.className='sync '+state;
  d.title={ok:'已同步',busy:'同步中…',err:'同步失败，联网后会自动重试'}[state]||'';
}

/* ---- 待上传队列（存在本机，刷新页面也不会丢） ---- */
function qkey(){ return 'qinhan-queue-'+(user&&user.id); }
function persistQueue(){ try{ localStorage.setItem(qkey(),JSON.stringify(queue)); }catch(e){} }
function loadQueue(){
  try{ const q=JSON.parse(localStorage.getItem(qkey())||'[]'); queue=Array.isArray(q)?q:[]; }catch(e){ queue=[]; }
}
function enqueue(item){ queue.push(item); persistQueue(); flush(); }

let errToastAt=0;
async function flush(){
  if(flushing||!user||!sb||!queue.length){ if(user&&!queue.length) setSync('ok'); return; }
  flushing=true; setSync('busy');
  try{
    while(queue.length){
      const it=queue[0];
      let res;
      try{
        res = it.t==='answer'
          ? await sb.rpc('record_answer',{p_word:it.word,p_correct:it.good})
          : await sb.rpc('finish_round',it.args);
      }catch(e){ res={error:e}; }
      if(res.error){
        const e=res.error, msg=String(e.message||'');
        const network=!e.code || /fetch|network|load failed/i.test(msg);
        const authRetry=/^PGRST30\d/.test(e.code||'') || e.status===401;
        if(network||authRetry) throw e;           // 网络或登录过期：留着，稍后重试
        console.warn('丢弃一条无法保存的记录：',it,e);  // 数据本身有问题：丢掉，免得卡住后面的
        if(Date.now()-errToastAt>5000){ errToastAt=Date.now(); toast('有一条记录保存失败：'+msg); }
        queue.shift(); persistQueue(); continue;
      }
      queue.shift(); persistQueue();
      if(it.t==='round' && res.data && !queue.length){
        profile=Object.assign(blankProfile(),pick(res.data,['wallet','best_money','best_score','rounds']));
      }
    }
    setSync('ok');
  }catch(e){
    setSync('err');
    if(Date.now()-errToastAt>15000){ errToastAt=Date.now(); toast('网络不太好，记录先存在本机，联网后自动上传'); }
  }finally{ flushing=false; }
}
function pick(o,keys){ const r={}; keys.forEach(k=>{ r[k]=o[k]; }); return r; }
window.addEventListener('online',flush);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) flush(); });

/* ---- 登录后：把云端数据全部取回来 ---- */
async function fetchProgress(){
  const out=[], size=1000; let from=0;
  for(;;){
    const {data,error}=await sb.from('word_progress')
      .select('word,seen_count,right_count,wrong_count,right_streak,in_wrongbook,last_seen')
      .eq('user_id',user.id).order('word').range(from,from+size-1);
    if(error) throw error;
    out.push.apply(out,data);
    if(data.length<size) break;
    from+=size;
  }
  return out;
}
async function loadAll(){
  const uid=user.id;
  const pr=await sb.from('profiles').select('wallet,best_money,best_score,rounds').eq('user_id',uid).maybeSingle();
  if(pr.error) throw pr.error;
  if(!pr.data){
    const ins=await sb.from('profiles').upsert({user_id:uid,nickname:(user.email||'').split('@')[0]});
    if(ins.error) throw ins.error;
    profile=blankProfile();
  }else{
    profile=Object.assign(blankProfile(),pr.data);
  }
  const rows=await fetchProgress();
  prog=new Map();
  rows.forEach(r=>{
    prog.set(r.word,{seen:r.seen_count,right:r.right_count,wrong:r.wrong_count,streak:r.right_streak,wb:!!r.in_wrongbook,last:Date.parse(r.last_seen)||0});
  });
}

/* 本地同步更新一次作答（逻辑和 schema.sql 里的 record_answer 保持一致） */
function applyAnswer(word,good){
  let p=prog.get(word);
  if(!p){ p={seen:0,right:0,wrong:0,streak:0,wb:false,last:0}; prog.set(word,p); }
  p.seen++; p.last=Date.now();
  if(good){ p.right++; p.streak++; if(p.wb && p.streak>=MASTER) p.wb=false; }
  else{ p.wrong++; p.streak=0; p.wb=true; }
}

/* ================= 登录 / 注册 ================= */
let authMode='login';
function authMsg(text,kind){ const m=$('#authMsg'); m.textContent=text||''; m.className='msg'+(kind==='ok'?' ok':''); }
function setAuthMode(mode){
  authMode=mode;
  $('#tabLogin').classList.toggle('on',mode==='login');
  $('#tabSignup').classList.toggle('on',mode==='signup');
  $('#btnAuth').textContent=mode==='login'?'登录':'注册';
  $('#pw').autocomplete=mode==='login'?'current-password':'new-password';
  authMsg('');
}
$('#tabLogin').addEventListener('click',()=>setAuthMode('login'));
$('#tabSignup').addEventListener('click',()=>setAuthMode('signup'));

$('#authForm').addEventListener('submit',async function(ev){
  ev.preventDefault();
  if(!sb){ authMsg('还没有配置好 Supabase，请先看 README 第 2 步。'); return; }
  const email=$('#email').value.trim(), pw=$('#pw').value;
  if(!email||!pw){ authMsg('请输入邮箱和密码'); return; }
  if(pw.length<6){ authMsg('密码至少 6 位'); return; }
  const btn=$('#btnAuth'); btn.disabled=true; authMsg('');
  try{
    if(authMode==='login'){
      const {error}=await sb.auth.signInWithPassword({email:email,password:pw});
      if(error) throw error;
    }else{
      const {data,error}=await sb.auth.signUp({email:email,password:pw});
      if(error) throw error;
      if(data.user && data.user.identities && data.user.identities.length===0){
        authMsg('这个邮箱已经注册过了，请直接登录'); return;
      }
      if(!data.session){
        setAuthMode('login');
        authMsg('注册成功！请到邮箱点击确认链接，然后回来登录。','ok');
      }
    }
  }catch(e){ authMsg(zhError(e)); }
  finally{ btn.disabled=false; }
});

function showSetupProblem(){
  let msg;
  if(!configured) msg='还没有配置 Supabase：请打开 config.js，填入 Project URL 和 anon key（详见 README 第 2 步）。';
  else msg='Supabase 脚本没有加载出来，请检查网络（可能需要换一个网络，或开启代理）后刷新。';
  authMsg(msg);
  ['email','pw','btnAuth','tabLogin','tabSignup'].forEach(id=>{ $('#'+id).disabled=true; });
}

async function logout(){
  if(!sb) return;
  try{ await flush(); }catch(e){}
  await sb.auth.signOut();
}
$('#btnLogout').addEventListener('click',logout);
$('#btnLoadOut').addEventListener('click',logout);

/* ================= 页面切换 ================= */
const screens={auth:$('#auth'),home:$('#home'),quiz:$('#quiz'),result:$('#result'),wrong:$('#wrong'),hist:$('#hist')};
function show(name){
  for(const k in screens) screens[k].hidden=(k!==name);
  window.scrollTo(0,0);
}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{ refreshHome(); show(b.dataset.go); }));
function showLoading(msg){
  $('#loading').hidden=false; $('#spinner').hidden=false; $('#loadActs').hidden=true; $('#loadMsg').textContent=msg||'正在加载…';
}
function showLoadError(msg){
  $('#loading').hidden=false; $('#spinner').hidden=true; $('#loadActs').hidden=false; $('#loadMsg').textContent=msg;
}
function hideLoading(){ $('#loading').hidden=true; }

function twoStep(btn,armedText,fn){
  const orig=btn.textContent; let t=null;
  btn.addEventListener('click',function(){
    if(btn.dataset.armed){ clearTimeout(t); delete btn.dataset.armed; btn.textContent=orig; fn(); return; }
    btn.dataset.armed='1'; btn.textContent=armedText;
    t=setTimeout(function(){ delete btn.dataset.armed; btn.textContent=orig; },3000);
  });
}

/* ================= 会话处理 ================= */
async function onSession(session){
  const u=session&&session.user;
  if(!u){
    user=null; loadedFor=null; loadingFor=null;
    prog=new Map(); profile=blankProfile(); queue=[]; flushing=false;
    try{ if(canSpeak) speechSynthesis.cancel(); }catch(e){}
    $('#sync').hidden=true;
    hideLoading(); show('auth');
    return;
  }
  user=u;
  if(loadedFor===u.id||loadingFor===u.id) return;   // 同一个用户重复触发就忽略
  loadingFor=u.id;
  showLoading('正在同步你的学习记录…');
  try{
    await loadAll();
    loadedFor=u.id;
    loadQueue(); setSync('ok');
    refreshHome(); show('home'); hideLoading();
    flush();
  }catch(e){
    console.error(e);
    let m=zhError(e);
    if(e&&(e.code==='42P01'||/relation .* does not exist|schema cache/i.test(e.message||''))) m='数据库里还没有建表，请先在 Supabase 的 SQL Editor 里运行 schema.sql。';
    showLoadError('加载失败：'+m);
  }finally{ loadingFor=null; }
}
$('#btnRetry').addEventListener('click',async function(){
  if(!sb) return;
  const {data}=await sb.auth.getSession();
  loadedFor=null; onSession(data.session);
});

/* ================= 出题 ================= */
function segs(x){
  if(!x.s){
    x.s=new Set(x.m.replace(/[A-Za-z]+\./g,' ').replace(/[（(［\[][^）)］\]]*[）)］\]]/g,' ')
      .split(/[，,；;、\s…/]+/).filter(s=>s.length>=2));
  }
  return x.s;
}
function overlap(a,b){ for(const s of a) if(b.has(s)) return true; return false; }

function makeOptions(x){
  const sx=segs(x), lx=x.full.length;
  const ok=y=>y.i!==x.i && y.full!==x.full && !overlap(sx,segs(y));
  const chosen=[], seen=new Set([x.full]);
  function take(list){
    const scored=list.filter(ok).map(y=>({y:y,s:Math.abs(y.full.length-lx)+Math.random()*8})).sort((a,b)=>a.s-b.s);
    for(const e of scored){
      if(chosen.length>=3) break;
      if(seen.has(e.y.full)) continue;
      seen.add(e.y.full); chosen.push(e.y);
    }
  }
  take(sample(byPos[x.t]||[],150));
  if(chosen.length<3) take(sample(WORDS,300));
  const all=shuffle([x].concat(chosen));
  return {opts:all, ans:all.indexOf(x)};
}

/* 新一轮：优先抽没做过的词；不够就用最久没做的词补足 */
function pickNew(){
  const unseen=WORDS.filter(x=>!prog.has(x.k));
  if(unseen.length>=N) return {list:sample(unseen,N),unseen:unseen.length};
  const need=N-unseen.length;
  const old=WORDS.filter(x=>prog.has(x.k)&&!prog.get(x.k).wb).sort((a,b)=>prog.get(a.k).last-prog.get(b.k).last);
  let fill=old.slice(0,need);
  if(fill.length<need){
    const wb=WORDS.filter(x=>prog.has(x.k)&&prog.get(x.k).wb);
    fill=fill.concat(wb.slice(0,need-fill.length));
  }
  return {list:shuffle(unseen.concat(fill)),unseen:unseen.length};
}
function wrongWords(){ return WORDS.filter(x=>{ const p=prog.get(x.k); return p&&p.wb; }); }

/* ================= 首页 ================= */
function counts(){
  let seen=0, wb=0;
  prog.forEach((p,k)=>{ if(wmap.has(k)){ seen++; if(p.wb) wb++; } });
  return {seen:seen,wb:wb};
}
function refreshHome(){
  if(!user) return;
  const c=counts(), total=WORDS.length;
  $('#userEmail').textContent=user.email||'';
  $('#coverFill').style.width=(c.seen/total*100).toFixed(1)+'%';
  let t='已做过 '+c.seen+' / '+total+' 个单词';
  t+=profile.rounds>0?('，完成 '+profile.rounds+' 轮'):'，现在开始第一轮吧';
  $('#coverText').textContent=t;
  $('#stWallet').textContent=fmt(profile.wallet);
  $('#stWrong').textContent=c.wb;
  $('#stBest').textContent=profile.best_score>0?(profile.best_score+'/'+N):'—';
  const bw=$('#btnWrongPractice');
  bw.disabled=c.wb===0;
  bw.textContent=c.wb?('练习错题本（'+c.wb+'）'):'错题本是空的';
}

/* ================= 答题流程 ================= */
const S={mode:'new',qs:[],total:N,idx:0,right:0,wrong:[],results:[],answered:false,money:0,streak:0,maxStreak:0};
const LETTERS=['A','B','C','D'];

function buildWall(box,n){
  box.textContent='';
  for(let i=0;i<n;i++) box.appendChild(document.createElement('span'));
}
function paintWall(box){
  const cells=box.children;
  for(let i=0;i<S.total;i++){
    const c=cells[i]; if(!c) continue; c.className='';
    if(S.results[i]===true) c.className='ok';
    else if(S.results[i]===false) c.className='no';
    else if(box.id==='wall' && i===S.idx) c.className='cur';
  }
}

function startRound(mode){
  if(!user) return;
  let list, note='';
  if(mode==='wrong'){
    const wl=wrongWords();
    if(!wl.length){ toast('错题本是空的'); return; }
    list=sample(wl,N);
  }else{
    const pk=pickNew(); list=pk.list;
    if(pk.unseen===0) note='整本词库已经刷完一遍，这一轮复习最久没做的词';
    else if(pk.unseen<N) note='新词只剩 '+pk.unseen+' 个，其余用最久没做的词补足';
  }
  ctx();
  S.mode=mode;
  S.qs=list.map(function(x){ const o=makeOptions(x); return {x:x,opts:o.opts,ans:o.ans}; });
  S.total=S.qs.length;
  S.idx=0; S.right=0; S.wrong=[]; S.results=[]; S.answered=false; S.money=0; S.streak=0; S.maxStreak=0;
  document.querySelectorAll('#quiz .n-total,#result .n-total').forEach(e=>e.textContent=S.total);
  $('#autoSpeak').checked=!!pref.auto;
  buildWall($('#wall'),S.total);
  show('quiz'); sfx.start();
  renderQ();
  if(note) toast(note);
}

function renderQ(){
  const q=S.qs[S.idx]; S.answered=false;
  $('#qNum').textContent=S.idx+1;
  $('#qMoney').textContent=fmt(S.money);
  $('#qRight').textContent=S.right;
  $('#wordText').textContent=q.x.w;
  $('#ipa').textContent=q.x.p?('/'+q.x.p+'/'):'';
  const box=$('#opts'); box.textContent=''; box.classList.remove('done');
  q.opts.forEach(function(o,k){
    const b=el('button','opt'); b.type='button'; b.dataset.i=k;
    b.appendChild(el('span','key',LETTERS[k]));
    b.appendChild(el('span','txt',o.full));
    b.addEventListener('click',()=>answer(k));
    box.appendChild(b);
  });
  $('#fb').textContent='';
  const nx=$('#btnNext'); nx.disabled=true; nx.textContent=(S.idx===S.total-1)?'查看成绩':'下一题';
  paintWall($('#wall'));
  if(pref.auto) setTimeout(()=>speak(q.x.w,$('#word')),200);
}

function answer(k){
  if(S.answered) return; S.answered=true;
  const q=S.qs[S.idx], good=(k===q.ans);
  S.results[S.idx]=good;
  applyAnswer(q.x.k,good);                              // 本地立刻更新
  enqueue({t:'answer',word:q.x.k,good:good});           // 同时上传到 Supabase
  let gain=0;
  if(good){ S.right++; S.streak++; if(S.streak>S.maxStreak) S.maxStreak=S.streak; gain=reward(S.streak); S.money+=gain; }
  else { S.wrong.push(q.x); S.streak=0; }

  const box=$('#opts'); box.classList.add('done');
  Array.prototype.forEach.call(box.children,function(b,i){
    if(i===q.ans) b.classList.add('right');
    else if(i===k) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  const fb=$('#fb'); fb.textContent='';
  fb.appendChild(el('span','stamp '+(good?'good':'bad'),good?'牛逼！':'回答错误啦'));
  if(good){ const g=el('span','gain','+'+fmt(gain)); if(S.streak>=2) g.appendChild(el('small',null,'连对 '+S.streak)); fb.appendChild(g); }
  else{ const a=el('span','ans','答案：'); a.appendChild(el('b',null,LETTERS[q.ans])); fb.appendChild(a); }
  good?sfx.right():sfx.wrong();
  $('#qRight').textContent=S.right;
  $('#qMoney').textContent=fmt(S.money);
  paintWall($('#wall'));
  const nx=$('#btnNext'); nx.disabled=false; nx.focus({preventScroll:true});
}

function next(){
  if(!S.answered) return;
  if(S.idx>=S.total-1){ finish(); return; }
  S.idx++; renderQ();
}

function remark(r){
  if(r===1) return '满分！一题没错。';
  if(r>=.9) return '牛逼！只差一点点就满分了。';
  if(r>=.76) return '很扎实，错的几个再看一眼就稳了。';
  if(r>=.6) return '过关了，继续刷会更稳。';
  if(r>=.4) return '还有不少生词，先看看下面的错题。';
  return '这批词比较难，多测几轮就熟了。';
}

function wordRow(x,extra){
  const li=document.createElement('li');
  const left=el('div','rv-word');
  const b=el('button'); b.type='button'; b.setAttribute('aria-label','朗读 '+x.w);
  b.appendChild(el('span',null,x.w));
  b.insertAdjacentHTML('beforeend',SPK_SVG);
  b.addEventListener('click',()=>speak(x.w));
  left.appendChild(b);
  const sub=el('small',null,(x.p?('/'+x.p+'/'):''));
  if(extra){ sub.appendChild(document.createTextNode(x.p?'  ·  ':'')); sub.appendChild(el('span','rv-count',extra)); }
  if(x.p||extra) left.appendChild(sub);
  li.appendChild(left);
  li.appendChild(el('div','rv-mean',x.full));
  return li;
}

function finish(){
  const total=S.total, score=S.right;
  const perfect=(S.mode==='new' && total===N && score===N)?PERFECT:0;
  const roundMoney=S.money+perfect;
  const prevBest=profile.best_score;

  // 本地先更新，界面立刻反映；再排队上传，由数据库做最终累加
  profile.wallet+=roundMoney; profile.rounds+=1;
  if(roundMoney>profile.best_money) profile.best_money=roundMoney;
  if(S.mode==='new' && score>profile.best_score) profile.best_score=score;
  enqueue({t:'round',args:{p_mode:S.mode,p_score:score,p_total:total,p_money:roundMoney,p_max_streak:S.maxStreak}});

  show('result');
  $('#resLabel').textContent=S.mode==='wrong'?'错题练习成绩':'本轮成绩';
  buildWall($('#wall2'),total); paintWall($('#wall2'));
  $('#resPct').textContent='正确率 '+Math.round(score/total*100)+'%';
  $('#resMoney').textContent=fmt(roundMoney);
  $('#resMoneySub').textContent='答对 '+score+' 题得 '+fmt(S.money)+(perfect?'，全对奖励 '+fmt(perfect):'')+'；最高连对 '+S.maxStreak+' 题；累计奖金 '+fmt(profile.wallet);
  $('#resRemark').textContent=remark(score/total);
  const rec=$('#resRecord'); rec.textContent='';
  if(S.mode==='new' && prevBest>0 && score>prevBest) rec.appendChild(el('span','record','新纪录'));
  $('#btnAgain').textContent=S.mode==='wrong'?'再练一轮错题':'再来一轮';
  $('#btnAgain').dataset.mode=S.mode;

  const num=$('#resNum');
  if(reduced||score===0){ num.textContent=score; }
  else{
    const t0=performance.now(), dur=700;
    (function tick(now){
      const p=Math.min(1,(now-t0)/dur);
      num.textContent=Math.round(score*(1-Math.pow(1-p,3)));
      if(p<1) requestAnimationFrame(tick);
    })(t0);
  }
  sfx.finish(score/total);

  const list=$('#wrongList'); list.textContent='';
  if(!S.wrong.length){
    $('#reviewSub').textContent='';
    const li=el('li',null,'这一轮全部答对，没有错题。'); li.style.display='block'; list.appendChild(li);
  }else{
    $('#reviewSub').textContent='共 '+S.wrong.length+' 个，已经自动加入错题本。点单词可以再听一遍发音。';
    S.wrong.forEach(x=>list.appendChild(wordRow(x)));
  }
}

/* ================= 错题本 ================= */
function renderWrongBook(){
  const items=[];
  prog.forEach((p,k)=>{ if(p.wb&&wmap.has(k)) items.push({x:wmap.get(k),p:p}); });
  items.sort((a,b)=>b.p.wrong-a.p.wrong||b.p.last-a.p.last);
  $('#wbCount').textContent=items.length;
  $('#btnWbPractice').disabled=!items.length;
  const list=$('#wbList'); list.textContent='';
  if(!items.length){
    const li=el('li','empty','错题本是空的。答错的单词会自动出现在这里，连续答对 '+MASTER+' 次后移出。'); li.style.display='block';
    list.appendChild(li); show('wrong'); return;
  }
  items.forEach(it=>list.appendChild(wordRow(it.x,'答错 '+it.p.wrong+' 次')));
  show('wrong');
}

/* ================= 最近记录 ================= */
async function renderHistory(){
  show('hist');
  $('#histList').textContent=''; $('#histMsg').textContent='加载中…';
  $('#histSub').textContent='累计奖金 '+fmt(profile.wallet)+'，完成 '+profile.rounds+' 轮，单轮最高 '+fmt(profile.best_money);
  try{
    const {data,error}=await sb.from('rounds')
      .select('mode,score,total,money,max_streak,created_at')
      .eq('user_id',user.id).order('created_at',{ascending:false}).limit(30);
    if(error) throw error;
    const ul=$('#histList'); ul.textContent='';
    if(!data.length){ $('#histMsg').textContent='还没有记录，去做一轮吧。'; return; }
    $('#histMsg').textContent='';
    data.forEach(function(r){
      const li=document.createElement('li');
      const d=new Date(r.created_at);
      const when=(d.getMonth()+1)+'月'+d.getDate()+'日 '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      li.appendChild(el('div','h-main',(r.mode==='wrong'?'错题练习':'新一轮')+' · 答对 '+r.score+'/'+r.total));
      li.appendChild(el('div','h-money','+'+fmt(r.money)));
      li.appendChild(el('div','h-sub',when+' · 最高连对 '+r.max_streak));
      ul.appendChild(li);
    });
  }catch(e){ $('#histMsg').textContent='加载失败：'+zhError(e); }
}

twoStep($('#btnReset'),'再点一次确认清除',async function(){
  try{
    queue=[]; persistQueue();
    const uid=user.id;
    const rs=await Promise.all([
      sb.from('word_progress').delete().eq('user_id',uid),
      sb.from('rounds').delete().eq('user_id',uid),
      sb.from('profiles').upsert({user_id:uid,nickname:(user.email||'').split('@')[0],wallet:0,best_money:0,best_score:0,rounds:0,updated_at:new Date().toISOString()})
    ]);
    const err=rs.map(r=>r.error).find(Boolean); if(err) throw err;
    prog=new Map(); profile=blankProfile();
    refreshHome(); show('home'); toast('全部记录和奖金已清除');
  }catch(e){ toast('清除失败：'+zhError(e)); }
});

/* ================= 事件 ================= */
$('#btnStart').addEventListener('click',()=>startRound('new'));
$('#btnWrongPractice').addEventListener('click',()=>startRound('wrong'));
$('#btnWbPractice').addEventListener('click',()=>startRound('wrong'));
$('#btnAgain').addEventListener('click',function(){ startRound(this.dataset.mode==='wrong'?'wrong':'new'); });
$('#btnHome').addEventListener('click',function(){ refreshHome(); show('home'); });
$('#btnWrongBook').addEventListener('click',renderWrongBook);
$('#btnHist').addEventListener('click',renderHistory);
$('#btnNext').addEventListener('click',next);
$('#word').addEventListener('click',function(){ speak(S.qs[S.idx].x.w,$('#word')); });
$('#autoSpeak').addEventListener('change',function(e){ pref.auto=e.target.checked; savePref(); });
twoStep($('#btnQuit'),'确认退出？',function(){
  try{ if(canSpeak) speechSynthesis.cancel(); }catch(e){}
  refreshHome(); show('home');
  toast('已退出，这一轮不计奖金，做过的题已保存');
});
document.addEventListener('keydown',function(e){
  if(screens.quiz.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const k=e.key.toLowerCase();
  const idx={a:0,b:1,c:2,d:3,'1':0,'2':1,'3':2,'4':3}[k];
  if(idx!==undefined){ e.preventDefault(); answer(idx); }
  else if(e.key==='ArrowRight' && S.answered){ e.preventDefault(); next(); }
});

/* ================= 启动 ================= */
(async function boot(){
  if(!sb){ hideLoading(); show('auth'); showSetupProblem(); return; }
  sb.auth.onAuthStateChange(function(event,session){
    // 回调里不能直接 await Supabase 请求，丢到下一个事件循环里处理
    setTimeout(function(){ onSession(session); },0);
  });
  try{
    const {data}=await sb.auth.getSession();
    onSession(data.session);
  }catch(e){ hideLoading(); show('auth'); authMsg(zhError(e)); }
})();

})();
