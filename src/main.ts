import './styles.css';

type SpendTag='식비'|'쇼핑'|'교통'|'기타';
type Entry={date:string;amount:number;note?:string;tag?:SpendTag;tagAmounts?:Partial<Record<SpendTag,number>>};
type ScoreSnapshot={score:number;updatedAt:string};
type CloseRecord={ym:string;budget:number;actual:number;saved:number;savingsRate:number;closedAt:string};
type State={budget:number;budgets:Record<string,number>;entries:Entry[];closes:Record<string,CloseRecord>;scoreHistory:Record<string,ScoreSnapshot>;onboarded:boolean};
type Status='SAFE'|'WATCH'|'BRAKE';
type DecisionInput={usage:number;projected:number;threeDay:boolean;day:number};
type GoldCase=DecisionInput&{id:string;expected:Status;rule:string};
type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
const key='three-number-money-os-v01';
const VERSION='V1.0 FINAL';
const RC_PARENT='V1.0 RC1 · v16 · 1787997995865';
const RELEASE_CHANNEL='FINAL';
const FREEZE_POLICY='기능 추가 금지 · 버그 수정 / 문구 / 모바일 UX만 허용';
const V09_PARENT='V0.8.1 · v14 · 1787997615732';
const PARENT_BASELINE='V0.7 · v12 · 1787997201832';
const FROZEN_BASELINE='V0.6 · v11 · 1787996989015';
const RULESET_VERSION='Money Decision Engine V1.0';
const CERT_NAME='CERTIFIED BASELINE';
const UI_BASELINE='JoyLab Money UI V1.0 BASELINE';
let deferredPrompt:InstallPromptEvent|null=null;
let certResult={loaded:false,passed:0,total:20,certified:false};
let scoreCert={loaded:false,passed:0,total:30,certified:false};
let boundaryCert={loaded:false,passed:0,total:10,certified:false};
let finalRegression={loaded:false,passed:0,total:50,certified:false};
let selectedHeatDate:string|null=null;
let activeTab='home';
let viewMonth='';
let monthPickerOpen=false;
let homeTag:SpendTag|undefined=undefined;
const TAGS:SpendTag[]=['식비','쇼핑','교통','기타'];

function localDate(d=new Date()){const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
const today=()=>localDate();
const ymNow=()=>today().slice(0,7);
viewMonth=ymNow();
const won=(n:number)=>Math.round(n).toLocaleString('ko-KR')+'원';
const pct=(n:number)=>Number.isFinite(n)?n.toFixed(1)+'%':'-';
const round10k=(n:number)=>Math.max(10000,Math.round(n/10000)*10000);
function rolloverBudget(budgets:Record<string,number>,current:string,previous:string,fallback:number){if(budgets[current])return budgets[current];if(budgets[previous])return budgets[previous];return fallback||0}
function canEditMonth(closedMonths:string[],ym:string){return !closedMonths.includes(ym)}
function applyTagAmount(existing:Partial<Record<SpendTag,number>>,tag:SpendTag|null|undefined,amount:number){const out={...existing};if(tag)out[tag]=(out[tag]||0)+amount;return out}
function load():State{
 try{
  const raw=JSON.parse(localStorage.getItem(key)||'{"budget":0,"entries":[]}');
  const budgets:Record<string,number>=raw.budgets||{};
  const current=ymNow();const previous=monthKey(-1);
  if(!budgets[current])budgets[current]=rolloverBudget(budgets,current,previous,Number(raw.budget)||0);
  const currentBudgetValue=budgets[current]||0;
  const next={budget:currentBudgetValue,budgets,entries:Array.isArray(raw.entries)?raw.entries:[],closes:raw.closes||{},scoreHistory:raw.scoreHistory||{},onboarded:Boolean(raw.onboarded)};
  localStorage.setItem(key,JSON.stringify(next));
  return next;
 }catch{return{budget:0,budgets:{},entries:[],closes:{},scoreHistory:{},onboarded:false}}
}
const save=(s:State)=>localStorage.setItem(key,JSON.stringify(s));
let state=load();
const app=document.querySelector<HTMLDivElement>('#app')!;

const rules=[
 ['R1','Usage ≥ 100%','BRAKE','예산 소진'],
 ['R2','Projected > 110%','BRAKE','월말 초과 위험'],
 ['R3','3-day overspend','BRAKE','연속 과소비'],
 ['R4','Usage ≥ 80%','WATCH','선택소비 축소'],
 ['R5','Projected > 90%','WATCH','월말 근접'],
 ['R6','Day ≤ 15 & Usage ≥ 50%','WATCH','전반부 과속'],
 ['R7','Otherwise','SAFE','정상 범위']
] as const;

function decide(i:DecisionInput):{status:Status;rule:string}{
 if(i.usage>=100)return{status:'BRAKE',rule:'R1'};
 if(i.projected>110)return{status:'BRAKE',rule:'R2'};
 if(i.threeDay)return{status:'BRAKE',rule:'R3'};
 if(i.usage>=80)return{status:'WATCH',rule:'R4'};
 if(i.projected>90)return{status:'WATCH',rule:'R5'};
 if(i.day<=15&&i.usage>=50)return{status:'WATCH',rule:'R6'};
 return{status:'SAFE',rule:'R7'};
}
async function runScoreCertification(){try{const r=await fetch('./score-gold-cases.json',{cache:'no-store'});const data=await r.json() as {cases:Array<{projectedRatio:number;oversRate:number;threeDay:boolean;recordCount:number;expected:number|null}>};const passed=data.cases.filter(g=>scoreCore(g.projectedRatio,g.oversRate,g.threeDay,g.recordCount)===g.expected).length;scoreCert={loaded:true,passed,total:data.cases.length,certified:passed===data.cases.length}}catch{scoreCert={loaded:true,passed:0,total:30,certified:false}}}
async function runBoundaryCertification(){try{const r=await fetch('./month-boundary-cases.json',{cache:'no-store'});const data=await r.json() as {cases:Array<{budgets:Record<string,number>;current:string;previous:string;fallback:number;expected:number}>};const passed=data.cases.filter(g=>rolloverBudget(g.budgets,g.current,g.previous,g.fallback)===g.expected).length;boundaryCert={loaded:true,passed,total:data.cases.length,certified:passed===data.cases.length}}catch{boundaryCert={loaded:true,passed:0,total:10,certified:false}}}
async function runFinalRegression(){try{const r=await fetch('./regression-v10-50.json',{cache:'no-store'});const data=await r.json() as {cases:Array<any>};const pass=(g:any)=>{if(g.type==='rollover')return rolloverBudget(g.budgets,g.current,g.previous,g.fallback)===g.expected;if(g.type==='shift')return shiftYm(g.ym,g.delta)===g.expected;if(g.type==='tag')return JSON.stringify(applyTagAmount(g.existing,g.tag,g.amount))===JSON.stringify(g.expected);if(g.type==='close')return canEditMonth(g.closedMonths,g.ym)===g.expected;if(g.type==='score')return scoreCore(g.projectedRatio,g.oversRate,g.threeDay,g.recordCount)===g.expected;return false};const passed=data.cases.filter(pass).length;finalRegression={loaded:true,passed,total:data.cases.length,certified:passed===data.cases.length}}catch{finalRegression={loaded:true,passed:0,total:50,certified:false}}}
async function runCertification(){
 try{
  const r=await fetch('./gold-cases.json',{cache:'no-store'});const data=await r.json() as {cases:GoldCase[]};
  const passed=data.cases.filter(g=>{const d=decide(g);return d.status===g.expected&&d.rule===g.rule}).length;
  certResult={loaded:true,passed,total:data.cases.length,certified:passed===data.cases.length};
 }catch{certResult={loaded:true,passed:0,total:20,certified:false}}
 await runScoreCertification();await runBoundaryCertification();await runFinalRegression();render();
}
function budgetForMonth(ym:string){return state.budgets[ym]||0}
function currentBudget(){return budgetForMonth(ymNow())||state.budget||0}
function entriesForMonth(ym:string){return state.entries.filter(e=>e.date.startsWith(ym)).sort((a,b)=>b.date.localeCompare(a.date))}
function monthTotal(ym:string){return entriesForMonth(ym).reduce((s,e)=>s+e.amount,0)}
function consecutiveOverspend(entries:Entry[],dailyBase:number){
 if(!dailyBase)return false;const map=new Map(entries.map(e=>[e.date,e.amount]));const now=new Date();
 for(let i=0;i<3;i++){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);if((map.get(localDate(d))||0)<=dailyBase)return false}
 return true;
}
function calc(){
 const entries=entriesForMonth(ymNow());const cumulative=entries.reduce((s,e)=>s+e.amount,0);const budget=currentBudget();const remaining=Math.max(0,budget-cumulative);
 const now=new Date();const day=now.getDate();const days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();const daysLeft=Math.max(1,days-day+1);
 const projected=day?cumulative/day*days:0;const usage=budget?cumulative/budget*100:0;const dailyBase=budget?budget/days:0;const dailyAllowance=budget?remaining/daysLeft:0;
 const threeDaySpike=consecutiveOverspend(entries,dailyBase);const decision=decide({usage,projected:budget?projected/budget*100:0,threeDay:threeDaySpike,day});
 let gate='0%';if(usage>=100)gate='100%';else if(usage>=80)gate='80%';else if(usage>=50)gate='50%';
 const gateMessage=gate==='100%'?'예산 100% 도달 · 필수지출 외 변동비 중단 권장':gate==='80%'?'예산 80% 도달 · 쇼핑·배달 등 선택소비 축소':gate==='50%'?'예산 50% 도달 · 현재 소비 속도 점검':'아직 50% Gate 이전';
 return{entries,cumulative,remaining,projected,usage,status:decision.status,rule:decision.rule,daysLeft,dailyBase,dailyAllowance,threeDaySpike,gate,gateMessage,budget,day};
}
function monthKey(offset:number){const n=new Date();return localDate(new Date(n.getFullYear(),n.getMonth()+offset,1)).slice(0,7)}
function monthLabel(ym:string){const [y,m]=ym.split('-');return y+'년 '+Number(m)+'월'}
function shiftYm(ym:string,delta:number){const [y,m]=ym.split('-').map(Number);const d=new Date(y,m-1+delta,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function monthNavHtml(){return '<div class="month-nav"><button id="prevMonth" class="month-nav-btn" aria-label="전월">‹</button><button id="monthPickerBtn" class="month-nav-label">'+monthLabel(viewMonth)+(viewMonth===ymNow()?' · 현재':'')+'</button><button id="nextMonth" class="month-nav-btn" aria-label="다음월">›</button></div>'}
function monthPickerHtml(){const year=Number(viewMonth.slice(0,4));return '<div class="modal-backdrop" id="monthPickerModal"><div class="modal month-picker"><div class="history-head"><div><span class="modal-kicker">월 선택</span><h2>'+year+'년</h2></div><button id="closeMonthPicker" class="x">×</button></div><div class="year-nav"><button id="prevYear">‹</button><strong>'+year+'년</strong><button id="nextYear">›</button></div><div class="month-grid">'+Array.from({length:12},(_,i)=>{const ym=year+'-'+String(i+1).padStart(2,'0');return '<button data-pick-month="'+ym+'" class="month-pick '+(ym===viewMonth?'active':'')+'">'+(i+1)+'월</button>'}).join('')+'</div><button id="goCurrentMonth" class="btn secondary">현재월로 이동</button></div></div>'}
function nextMonthKey(){return monthKey(1)}
function history(){
 const months=[monthKey(-2),monthKey(-1),monthKey(0)];
 return months.map((ym,i)=>{const total=monthTotal(ym);const budget=budgetForMonth(ym);return{ym,total,budget,current:i===2,closed:Boolean(state.closes[ym])}});
}
function recent30Entries(){const cutoff=new Date();cutoff.setDate(cutoff.getDate()-29);const min=localDate(cutoff);return state.entries.filter(e=>e.date>=min&&e.date<=today())}
function scoreCore(projectedRatio:number,oversRate:number,threeDay:boolean,recordCount:number){if(recordCount<3)return null;const pace=Math.max(0,Math.min(60,60-Math.max(0,projectedRatio-1)*120));const consistency=25*(1-Math.max(0,Math.min(1,oversRate)));const streak=threeDay?0:15;return Math.round(Math.max(0,Math.min(100,pace+consistency+streak)))}
function scoreTrend(){const cur=state.scoreHistory[ymNow()]?.score;const prev=state.scoreHistory[monthKey(-1)]?.score;const delta=cur!=null&&prev!=null?cur-prev:null;return{cur,prev,delta}}
function scoreTrendHtml(){const months=[monthKey(-2),monthKey(-1),monthKey(0)];const vals=months.map(ym=>state.scoreHistory[ym]?.score);const xs=[22,100,178];const pts=vals.map((v,i)=>v==null?null:{x:xs[i],y:12+(100-v)*.5,v}).filter((p):p is {x:number;y:number;v:number}=>p!==null);const line=pts.length>=2?'<polyline points="'+pts.map(p=>p.x+','+p.y).join(' ')+'" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>':'';const circles=pts.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="4.5" fill="#c8ff45" stroke="#0b1f4d" stroke-width="2"/>').join('');const labels=months.map((ym,i)=>'<text x="'+xs[i]+'" y="75" text-anchor="middle">'+Number(ym.slice(5))+'월</text>').join('');const values=vals.map((v,i)=>v==null?'':'<text class="score-chart-value" x="'+xs[i]+'" y="'+(8+(100-v)*.5)+'" text-anchor="middle">'+v+'</text>').join('');return '<div class="score-mini-chart"><svg viewBox="0 0 200 82" role="img" aria-label="최근 3개월 소비 Score 추이"><line x1="18" y1="62" x2="182" y2="62" stroke="rgba(255,255,255,.12)"/>'+line+circles+values+labels+'</svg></div>'}
function spendingScore(c:ReturnType<typeof calc>){const recent=recent30Entries();const projectedRatio=c.budget?c.projected/c.budget:0;const overs=recent.filter(e=>e.amount>c.dailyBase&&c.dailyBase>0).length;const oversRate=recent.length?overs/recent.length:0;const score=scoreCore(projectedRatio,oversRate,c.threeDaySpike,recent.length);if(score===null)return{score:null as number|null,label:'기록 대기',suggestion:'3일 이상 기록하면 30일 소비 Score가 시작됩니다.'};let suggestion='현재 소비 속도를 유지하세요.';if(c.status==='BRAKE')suggestion='다음 3일은 하루 '+won(c.dailyAllowance)+' 이내로 맞춰보세요.';else if(c.status==='WATCH')suggestion='선택소비 1회를 줄여 월말 예상액을 목표 안으로 돌려보세요.';else if(oversRate>.35)suggestion='고지출일을 이번 주 1회만 줄여보세요.';return{score,label:score>=85?'아주 안정적':score>=70?'안정적':score>=55?'주의':'개선 필요',suggestion}}
function heatmapHtml(ym:string){const [y,m1]=ym.split('-').map(Number);const m=m1-1;const days=new Date(y,m+1,0).getDate();const first=new Date(y,m,1).getDay();const entries=entriesForMonth(ym);const budget=budgetForMonth(ym);const dailyBase=budget?budget/days:0;const map=new Map(entries.map(e=>[Number(e.date.slice(-2)),e.amount]));let html='<div class="heat-week"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="heat-grid">';for(let i=0;i<first;i++)html+='<span class="heat-cell blank"></span>';for(let d=1;d<=days;d++){const amount=map.get(d)||0;const ratio=dailyBase?amount/dailyBase:0;const level=amount===0?0:ratio<=.75?1:ratio<=1.25?2:3;html+='<button class="heat-cell l'+level+'" data-heat-date="'+ym+'-'+String(d).padStart(2,'0')+'" title="'+d+'일 · '+won(amount)+'"><b>'+d+'</b></button>'}return html+'</div><div class="heat-legend"><span>적음</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><span>많음</span></div>'}
function anyThreeDayOverspend(ym:string,dailyBase:number){if(!dailyBase)return false;const map=new Map(entriesForMonth(ym).map(e=>[e.date,e.amount]));const [y,m]=ym.split('-').map(Number);const days=new Date(y,m,0).getDate();for(let d=3;d<=days;d++){const dates=[d-2,d-1,d].map(x=>ym+'-'+String(x).padStart(2,'0'));if(dates.every(dt=>(map.get(dt)||0)>dailyBase))return true}return false}
function tagStats(ym:string){const total=monthTotal(ym);const sums:Record<SpendTag,number>={식비:0,쇼핑:0,교통:0,기타:0};for(const e of entriesForMonth(ym)){if(e.tagAmounts){for(const t of TAGS)sums[t]+=e.tagAmounts[t]||0}else if(e.tag)sums[e.tag]+=e.amount}return TAGS.map(tag=>({tag,amount:sums[tag],pct:total?sums[tag]/total*100:0}))}
function tagBarsHtml(ym:string){return '<div class="tag-bars">'+tagStats(ym).map(s=>'<div class="tag-bar-row"><div class="tag-bar-head"><b>'+s.tag+'</b><span>'+won(s.amount)+' · '+s.pct.toFixed(1)+'%</span></div><div class="tag-bar-track"><i style="width:'+Math.min(100,s.pct)+'%"></i></div></div>').join('')+'</div>'}
function monthAnalysis(ym:string){const entries=entriesForMonth(ym);const total=monthTotal(ym);const budget=budgetForMonth(ym);const [y,m]=ym.split('-').map(Number);const days=new Date(y,m,0).getDate();const dailyBase=budget?budget/days:0;const overs=entries.filter(e=>e.amount>dailyBase&&dailyBase>0).length;const oversRate=entries.length?overs/entries.length:0;const retrospective=scoreCore(budget?total/budget:0,oversRate,anyThreeDayOverspend(ym,dailyBase),entries.length);const snap=state.scoreHistory[ym]?.score;const score=snap??retrospective;const savings=budget-total;const savingsRate=budget?savings/budget*100:null;return{entries,total,budget,score,scoreSource:snap!=null?'저장 Score':'재구성 Score',savings,savingsRate,closed:Boolean(state.closes[ym]),dailyBase}}
function overspendTop3(ym:string,dailyBase:number){return entriesForMonth(ym).map(e=>({date:e.date,amount:e.amount,excess:Math.max(0,e.amount-dailyBase)})).filter(x=>x.excess>0).sort((a,b)=>b.excess-a.excess).slice(0,3)}
function overspendTop3Html(ym:string,dailyBase:number){const rows=overspendTop3(ym,dailyBase);if(!rows.length)return '<div class="report-empty">과소비일이 없습니다.</div>';return '<div class="overspend-top3">'+rows.map((x,i)=>'<div class="overspend-row"><span>'+(i+1)+'</span><b>'+x.date.slice(5).replace('-','/')+'</b><strong>'+won(x.amount)+'</strong><small>권장액 대비 +'+won(x.excess)+'</small></div>').join('')+'</div>'}
function dominantTagWarning(ym:string){const stats=tagStats(ym).sort((a,b)=>b.amount-a.amount);const top=stats[0];if(!top||top.amount<=0)return '<div class="dominant-warning neutral"><b>태그 경고 없음</b><span>태그가 지정된 지출이 아직 없습니다.</span></div>';const high=top.pct>=40;return '<div class="dominant-warning '+(high?'high':'normal')+'"><b>이번 달 가장 많이 쓴 태그 · '+top.tag+'</b><span>'+won(top.amount)+' · '+top.pct.toFixed(1)+'%'+(high?' · 비중이 높습니다. 한 번 점검해보세요.':' · 현재 최다 지출 태그입니다.')+'</span></div>'}
function suggestedNextBudget(){
 const current=currentBudget();const actuals=[monthKey(-2),monthKey(-1),monthKey(0)].map(monthTotal).filter(v=>v>0);
 if(!current)return actuals.length?round10k(actuals.reduce((a,b)=>a+b,0)/actuals.length*.95):0;
 if(!actuals.length)return current;
 const raw=round10k(actuals.reduce((a,b)=>a+b,0)/actuals.length*.95);
 return round10k(Math.min(current*1.05,Math.max(current*.85,raw)));
}
function msg(c:ReturnType<typeof calc>){
 if(!c.budget)return'먼저 이번 달 변동비 목표를 입력하세요.';
 if(c.rule==='R3')return'최근 3일 연속 하루 권장액을 초과했습니다. 연속 과소비 신호로 BRAKE가 작동했습니다.';
 const diff=Math.abs(c.projected-c.budget);
 if(c.status==='SAFE')return'현재 소비 속도는 안정적입니다. 이 흐름을 유지하세요.';
 if(c.status==='WATCH')return c.projected>c.budget?'현재 속도라면 월말에 약 '+won(diff)+' 초과할 가능성이 있습니다.':'예산 사용 속도가 빨라지고 있습니다. 선택소비를 점검하세요.';
 return c.projected>c.budget?'지출 브레이크가 필요합니다. 현재 속도라면 약 '+won(diff)+' 초과 예상입니다.':'예산 사용률이 위험 구간에 진입했습니다.';
}
function trendBars(){const h=history();const max=Math.max(1,...h.map(x=>x.total));return h.map(x=>`<div class="trend-col"><div class="trend-value">${x.total?won(x.total):'0원'}</div><div class="trend-track"><div class="trend-fill" style="height:${Math.max(5,x.total/max*100)}%"></div></div><div class="trend-label">${Number(x.ym.slice(5))}월${x.current?' · 진행중':''}</div></div>`).join('')}
function onboarding(){
 return `<div class="modal-backdrop" id="onboarding"><div class="modal onboarding"><div class="steps"><span>1</span><span>2</span><span>3</span></div><h2>숫자 하나만 기록하세요</h2><div class="onboard-grid"><div><b>01</b><strong>오늘 변동비</strong><p>카드·현금 중 내가 통제할 수 있는 소비만 합산합니다.</p></div><div><b>02</b><strong>판단은 자동</strong><p>누적·월말 예상·SAFE/WATCH/BRAKE를 자동 계산합니다.</p></div><div><b>03</b><strong>데이터는 내 기기</strong><p>회원가입 없이 이 브라우저 localStorage에만 저장합니다.</p></div></div><button id="startApp" class="btn">시작하기</button></div></div>`;
}
function render(){
 const c=calc();const cls=c.status.toLowerCase();const usagePct=Math.min(100,Math.max(0,c.usage));const now=new Date();const dateText=now.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
 const h=history();const prev=h[1];const cur=h[2];const saved=prev.total-cur.total;const close=state.closes[ymNow()];const suggestion=suggestedNextBudget();const canClose=c.day>=25;const score=spendingScore(c);const viewAnalytics=monthAnalysis(viewMonth);const viewEntries=viewAnalytics.entries;const viewTotal=viewAnalytics.total;const viewBudget=viewAnalytics.budget;const viewClose=state.closes[viewMonth];const viewSaved=viewAnalytics.savings;if(score.score!==null&&state.scoreHistory[ymNow()]?.score!==score.score){state.scoreHistory[ymNow()]={score:score.score,updatedAt:new Date().toISOString()};save(state)}const scoreDelta=scoreTrend();const selectedEntry=selectedHeatDate?state.entries.find(e=>e.date===selectedHeatDate):undefined;
 app.innerHTML=`
 <main class="shell">
  <header class="top"><div class="brand-block"><div class="brand-mark"><span>J</span></div><div><div class="eyebrow">JOYLAB MONEY</div><h1 class="title">내 소비, 오늘도 가볍게.</h1><p class="sub">하루 한 번 숫자만 적으면 됩니다.</p></div></div><div class="top-actions"><button id="info" class="icon-btn" aria-label="앱 정보">i</button><button id="install" class="icon-btn" aria-label="홈 화면 설치">＋</button></div></header>
  <section id="tab-home" class="tab-view">
   <section class="budget-strip"><div><span>이번 달 목표</span><strong>${c.budget?won(c.budget):'목표를 설정해보세요'}</strong></div><button id="budgetEdit" class="pill-btn">수정</button></section><section id="budgetPanel" class="card budget-panel hidden"><div class="setup"><div><label class="label" for="budget">이번 달 변동비 목표</label><div class="input-wrap"><input id="budget" class="money-input" inputmode="numeric" placeholder="예: 800000" value="${c.budget||''}"><span class="unit">원</span></div></div><button id="saveBudget" class="btn secondary">목표 저장</button></div></section>
   <section class="hero-card">
   <div class="hero-topline"><span>${dateText}</span><span class="status-dot ${cls}"></span></div><div class="hero-kicker">이번 달 쓴 돈</div><div class="big hero-number">${won(c.cumulative)}</div><div class="hero-one-line">${c.budget?`남은 돈 <b>${won(c.remaining)}</b> · ${c.status}`:`목표를 먼저 설정해 주세요`}</div><div class="input-card"><div class="input-title">오늘 얼마 썼나요?</div><div class="quick-tags">${TAGS.map(t=>`<button type="button" class="quick-tag ${homeTag===t?'active':''}" data-home-tag="${t}">${t}</button>`).join('')}</div><div class="setup"><div class="input-wrap"><input id="amount" class="money-input" inputmode="numeric" autofocus placeholder="예: 32000"><span class="unit">원</span></div><button id="add" class="btn">기록하기</button></div><div class="quick-tag-note">${homeTag?homeTag+'로 기록됩니다.':'태그는 선택사항입니다.'}</div></div>

   <div class="home-mini"><span>오늘 쓸 수 있는 돈</span><strong>${c.budget?won(c.dailyAllowance):'-'}</strong></div>
   <button id="whyDecision" class="why-link home-why">왜 이렇게 판단했나요?</button>
   </section>
  </section>
  <section id="tab-analysis" class="tab-view hidden month-swipe-zone">
   <section class="section-head"><span>분석</span><h2>월별 흐름을 봐요</h2><p>전월과 다음월로 이동해 기록과 목표를 비교할 수 있습니다.</p></section>${monthNavHtml()}<section class="card month-overview"><div><span>선택 월 지출</span><strong>${won(viewTotal)}</strong></div><div><span>선택 월 목표</span><strong>${viewBudget?won(viewBudget):'-'}</strong></div><div><span>${viewAnalytics.closed?'확정 절감액':'현재 차이'}</span><strong>${viewBudget?won(viewSaved):'-'}</strong></div></section><section class="card monthly-report"><div class="report-head"><div><div class="label">${monthLabel(viewMonth)} 월간 리포트</div><div class="muted">Score · 절감률 · 태그 · 과소비일</div></div><span class="rc-chip">V1.0 RC</span></div><div class="report-kpis"><div><span>Score</span><strong>${viewAnalytics.score==null?'—':viewAnalytics.score}</strong><small>${viewAnalytics.scoreSource}</small></div><div><span>절감률</span><strong>${viewAnalytics.savingsRate==null?'-':pct(viewAnalytics.savingsRate)}</strong><small>${viewAnalytics.closed?'마감 확정':'현재 기록 기준'}</small></div><div><span>기록일</span><strong>${viewEntries.length}</strong><small>일</small></div></div>${dominantTagWarning(viewMonth)}<div class="report-section"><div class="label">태그별 지출 비중</div>${tagBarsHtml(viewMonth)}</div><div class="report-section"><div class="label">과소비일 TOP3</div>${overspendTop3Html(viewMonth,viewAnalytics.dailyBase)}</div></section>
   <section class="score-card"><div><span>30일 소비 Score</span><strong>${score.score===null?'—':score.score}</strong><small>${score.score===null?'최소 3일 기록 필요':score.label+' · 100점 만점'}</small>${scoreDelta.delta!==null?`<div class="score-delta ${scoreDelta.delta>=0?'up':'down'}">지난달 ${scoreDelta.prev}점 → 이번 달 ${scoreDelta.cur}점 · ${scoreDelta.delta>=0?'+':''}${scoreDelta.delta}</div>`:''}</div><div class="score-suggestion"><span>이번 달 개선 제안</span><b>${score.suggestion}</b>${scoreTrendHtml()}</div></section>
   <section class="card insight-card"><div class="history-head"><div><div class="label">현재 소비 상태</div><div class="insight-status ${cls}">${c.status}</div></div><div class="analysis-number"><span>월말 예상</span><strong>${c.cumulative?won(c.projected):'0원'}</strong></div></div><div class="message">${msg(c)}</div><div class="analysis-mini"><span>${c.gateMessage}</span><span>${c.threeDaySpike?'3일 연속 과소비 감지':'연속 과소비 없음'}</span></div></section>
   <section class="card close-card">
    <div class="history-head"><div><div class="label">월 마감 & 다음 달 계획</div><div class="muted">${close?'이번 달 마감 완료':'매월 25일부터 마감 가능'}</div></div><span class="close-badge ${close?'done':''}">${close?'CLOSED':'OPEN'}</span></div>
    <div class="close-grid"><div><span>현재 절감액</span><strong>${c.budget?won(c.budget-c.cumulative):'-'}</strong></div><div><span>절감률 KPI</span><strong>${c.budget?pct((c.budget-c.cumulative)/c.budget*100):'-'}</strong></div><div><span>다음 달 추천 목표</span><strong>${suggestion?won(suggestion):'-'}</strong><small>최근 최대 3개월 평균 × 95%, 현 목표 85~105% 제한</small></div></div>
    <div class="close-actions"><button id="closeMonth" class="btn ${canClose&&!close?'':'disabled'}" ${canClose&&!close?'':'disabled'}>이번 달 마감</button><button id="applyNext" class="btn secondary" ${suggestion?'':'disabled'}>추천 목표를 다음 달에 적용</button></div>
   </section>
   <section class="card history-card"><div class="history-head"><div><div class="label">3개월 HISTORY</div><div class="muted">월별 변동비 추이 · 마감 스냅샷 보존</div></div><div class="saving ${saved>=0?'plus':'minus'}">지난달 대비 ${saved>=0?'+':''}${won(saved)}</div></div><div class="trend">${trendBars()}</div><div class="month-table">${h.map(x=>`<div class="month-line"><div><strong>${monthLabel(x.ym)}</strong><small>${x.closed?'마감완료':x.current?'진행중':'미마감'}</small></div><div><span>실제 ${won(x.total)}</span><span>목표 ${x.budget?won(x.budget):'-'}</span></div></div>`).join('')}</div></section>
  </section>
  <section id="tab-records" class="tab-view hidden month-swipe-zone">
   <section class="section-head"><span>기록</span><h2>월별 기록</h2><p>전월과 다음월로 이동해 날짜별 변동비를 확인합니다.</p></section>${monthNavHtml()}
   <section class="card heat-card"><div class="history-head"><div><div class="label">이번 달 소비 히트맵</div><div class="muted">날짜를 누르면 금액을 확인·수정할 수 있습니다.</div></div><span class="heat-month">${monthLabel(viewMonth)}</span></div>${heatmapHtml(viewMonth)}</section>
   <section class="card"><div class="history-head"><div><div class="label">이번 달 기록</div><div class="muted">같은 날짜에 다시 기록하면 금액이 합산됩니다.</div></div><button id="reset" class="btn secondary compact">이번 달 초기화</button></div><div class="list">${viewEntries.length?viewEntries.map(e=>`<div class="row"><div class="d">${e.date.slice(5).replace('-','/')}</div><div class="record-main"><div class="record-top"><div class="a">${won(e.amount)}</div>${e.tag?`<span class="tag-chip">${e.tag}</span>`:''}</div>${e.note?`<small>${e.note}</small>`:''}</div><button data-date="${e.date}">삭제</button></div>`).join(''):'<div class="empty">아직 기록이 없습니다.</div>'}</div></section>
  </section>
  <section id="tab-settings" class="tab-view hidden">
   <section class="section-head"><span>설정</span><h2>JoyLab Money</h2><p>목표, 설치, 개인정보와 앱의 판단 기준을 관리합니다.</p></section>
   <section class="card settings-list">
    <button id="settingsBudget" class="settings-row"><span><b>이번 달 목표</b><small>${c.budget?won(c.budget):'설정 안 됨'}</small></span><i>›</i></button>
    <button id="settingsInstall" class="settings-row"><span><b>홈 화면에 설치</b><small>앱처럼 빠르게 실행</small></span><i>›</i></button>
    <div class="settings-row static"><span><b>데이터 저장</b><small>서버 전송 없이 이 브라우저 localStorage에만 저장</small></span></div>
    <div class="settings-row static"><span><b>월 전환</b><small>새 달 시작 시 이전 달 목표 자동 승계 · 새 달 기록은 0원부터 시작</small></span></div>
    <div class="settings-row static"><span><b>버전</b><small>JoyLab Money OS ${VERSION} · ${RELEASE_CHANNEL}</small></span></div>
    <div class="settings-row static"><span><b>FINAL 기준</b><small>Parent · ${RC_PARENT}</small></span></div>
    <div class="settings-row static"><span><b>Freeze Policy</b><small>${FREEZE_POLICY}</small></span></div>
    <div class="settings-row static"><span><b>개발 기준</b><small>V0.6 FROZEN 유지 · V0.8 parent ${PARENT_BASELINE}</small></span></div>
    <div class="settings-row static"><span><b>UI 기준</b><small>${UI_BASELINE}</small></span></div>
    <div class="settings-row static"><span><b>동결 기준</b><small>FROZEN CERTIFIED BASELINE · ${FROZEN_BASELINE}</small></span></div>
   </section>
   <section class="card audit-card"><div class="history-head"><div><div class="label">Release Audit Timeline</div><div class="muted">V0.7 이후 변경이력과 회귀 상태</div></div><span class="cert ${certResult.certified&&scoreCert.certified&&boundaryCert.certified?'ok':'pending'}">${certResult.certified&&scoreCert.certified&&boundaryCert.certified?'REGRESSION PASS':'CHECKING'}</span></div><div class="audit-list"><div class="audit-entry latest"><div><b>V1.0 FINAL</b><small>Parent · ${RC_PARENT}</small></div><ul><li>+ Regression 50 Case Gate</li><li>+ Freeze Policy 적용</li><li>+ FINAL 승격</li></ul><div class="audit-regression"><span>Final ${finalRegression.passed}/${finalRegression.total}</span><span>Decision ${certResult.passed}/${certResult.total}</span><span>Score ${scoreCert.passed}/${scoreCert.total}</span><span>Boundary ${boundaryCert.passed}/${boundaryCert.total}</span></div></div><div class="audit-entry"><div><b>V1.0 RC1</b><small>v16 · Release Candidate</small></div><ul><li>+ 월간 리포트: Score / 절감률 / 태그 비중 / 과소비일 TOP3</li><li>+ 최다 지출 태그 1개 자동 경고</li><li>+ Release Candidate 승격</li></ul><div class="audit-regression"><span>Decision ${certResult.passed}/${certResult.total}</span><span>Score ${scoreCert.passed}/${scoreCert.total}</span><span>Boundary ${boundaryCert.passed}/${boundaryCert.total}</span><span>V0.6 FROZEN 유지</span></div></div><div class="audit-entry"><div><b>V0.9</b><small>Parent · ${V09_PARENT}</small></div><ul><li>+ 입력 즉시 태그 선택</li><li>+ 태그 비중 4개 막대</li><li>+ 월 스와이프 + 12개월 선택</li><li>+ 선택 월 Score·절감률·태그 분석</li><li>+ Release Audit Timeline</li></ul><div class="audit-regression"><span>Decision ${certResult.passed}/${certResult.total}</span><span>Score ${scoreCert.passed}/${scoreCert.total}</span><span>Boundary ${boundaryCert.passed}/${boundaryCert.total}</span><span>UI V1.0 유지</span></div></div><div class="audit-entry"><div><b>V0.8.1</b><small>v14 · 월 탐색</small></div><ul><li>전월 / 다음월 이동</li><li>과거월 기록 조회·수정</li></ul></div><div class="audit-entry"><div><b>V0.8</b><small>v13 · 태그·차트·Audit</small></div><ul><li>수동 태그 4종</li><li>3개월 Score 미니 라인차트</li><li>Baseline Diff / Regression</li></ul></div><div class="audit-entry muted-entry"><div><b>V0.7</b><small>V0.6 FROZEN 위에서 확장</small></div><ul><li>월별 Score History</li><li>히트맵 메모 1줄</li></ul></div></div></section>
   <section class="card final-cert-card"><div class="history-head"><div><div class="label">V1.0 FINAL Regression</div><div class="muted">Boundary 10 · Month 10 · Tag 10 · Close 10 · Score 10</div></div><span class="cert ${finalRegression.certified?'ok':'pending'}">${finalRegression.loaded?(finalRegression.certified?'GREEN '+finalRegression.passed+'/'+finalRegression.total:'FAILED '+finalRegression.passed+'/'+finalRegression.total):'VERIFYING...'}</span></div><div class="freeze-note">${FREEZE_POLICY}</div></section>
   <section class="card developer-card"><div class="history-head"><div><div class="label">판단 엔진</div><div class="muted">${RULESET_VERSION}</div></div><span class="cert ${certResult.certified?'ok':'pending'}">${certResult.loaded?(certResult.certified?'CERTIFIED '+certResult.passed+'/'+certResult.total:'FAILED '+certResult.passed+'/'+certResult.total):'VERIFYING...'}</span></div><div class="cert-stack"><div><span>Money Score Engine V1.0</span><b class="cert ${scoreCert.certified?'ok':'pending'}">${scoreCert.loaded?(scoreCert.certified?'CERTIFIED '+scoreCert.passed+'/'+scoreCert.total:'FAILED '+scoreCert.passed+'/'+scoreCert.total):'VERIFYING...'}</b></div><div><span>Month Boundary Suite</span><b class="cert ${boundaryCert.certified?'ok':'pending'}">${boundaryCert.loaded?(boundaryCert.certified?'PASS '+boundaryCert.passed+'/'+boundaryCert.total:'FAILED '+boundaryCert.passed+'/'+boundaryCert.total):'VERIFYING...'}</b></div></div><div class="decision-actions"><button id="rulesToggle" class="btn secondary compact">판단 규칙 보기</button><a class="btn secondary compact link-btn" href="./gold-cases.json" target="_blank" rel="noopener">Gold Case 20</a></div><div id="rulesPanel" class="rules-panel hidden">${rules.map(r=>`<div class="rule-row"><b>${r[0]}</b><span>${r[1]}</span><strong>${r[2]}</strong><small>${r[3]}</small></div>`).join('')}</div></section>
  </section>
  <div class="footer-note">오프라인 사용 가능 · 서버 전송 없음 · 데이터는 현재 브라우저에 저장</div>
 </main>
 <nav class="bottom-nav" aria-label="메인 메뉴">
  <button data-tab="home" class="nav-item active" aria-label="홈"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.7 12 3.8l8.5 6.9v8.6a1.7 1.7 0 0 1-1.7 1.7h-4.6v-6.1H9.8V21H5.2a1.7 1.7 0 0 1-1.7-1.7z"/></svg><b>홈</b></button>
  <button data-tab="records" class="nav-item" aria-label="기록"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h12a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5Z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg><b>기록</b></button>
  <button data-tab="analysis" class="nav-item" aria-label="분석"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11M12 19V5M19 19v-8"/><path d="M3.5 19.5h17"/></svg><b>분석</b></button>
  <button data-tab="settings" class="nav-item" aria-label="설정"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M19.1 13.4a7.5 7.5 0 0 0 0-2.8l2-1.6-2-3.4-2.5 1a7.7 7.7 0 0 0-2.4-1.4L13.8 2h-3.9l-.4 3.2a7.7 7.7 0 0 0-2.4 1.4l-2.5-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2.8l-2 1.6 2 3.4 2.5-1a7.7 7.7 0 0 0 2.4 1.4l.4 3.2h3.9l.4-3.2a7.7 7.7 0 0 0 2.4-1.4l2.5 1 2-3.4z"/></svg><b>설정</b></button>
 </nav>
 ${monthPickerOpen?monthPickerHtml():''}
 ${selectedHeatDate?`<div class="modal-backdrop" id="dayModal"><div class="modal day-modal"><div class="history-head"><div><span class="modal-kicker">지출 상세</span><h2>${selectedHeatDate}</h2></div><button id="closeDay" class="x">×</button></div><label class="label" for="dayAmount">이날 변동비</label><div class="input-wrap"><input id="dayAmount" class="money-input" inputmode="numeric" value="${selectedEntry?selectedEntry.amount:''}" placeholder="0"><span class="unit">원</span></div><label class="label tag-label">태그</label><div class="tag-options">${TAGS.map(t=>`<button type="button" class="tag-option ${selectedEntry?.tag===t?'active':''}" data-tag="${t}">${t}</button>`).join('')}</div><label class="label note-label" for="dayNote">메모 한 줄</label><input id="dayNote" class="note-input" maxlength="60" value="${selectedEntry?.note||''}" placeholder="예: 가족 외식, 병원, 선물"><div class="note-counter">최대 60자 · 소비 이유만 간단히</div><div class="day-actions"><button id="saveDay" class="btn">수정 저장</button><button id="deleteDay" class="btn secondary" ${selectedEntry?'':'disabled'}>이날 기록 삭제</button></div><p class="modal-note">마감된 월은 수정할 수 없습니다.</p></div></div>`:''}
 ${state.onboarded?'':onboarding()}
`;
 const budget=document.querySelector<HTMLInputElement>('#budget')!;const amount=document.querySelector<HTMLInputElement>('#amount')!;document.querySelector('#budgetEdit')?.addEventListener('click',()=>document.querySelector('#budgetPanel')?.classList.toggle('hidden'));
 document.querySelector('#saveBudget')!.addEventListener('click',()=>{const n=Number(budget.value.replace(/,/g,''));if(!Number.isFinite(n)||n<=0){alert('월 변동비 목표를 1원 이상 입력하세요.');return}state.budget=Math.round(n);state.budgets[ymNow()]=Math.round(n);save(state);render()});
 const add=()=>{if(state.closes[ymNow()]){alert('이번 달은 이미 마감되었습니다.');return}const n=Number(amount.value.replace(/,/g,''));if(!Number.isFinite(n)||n<=0){alert('오늘 변동비를 1원 이상 입력하세요.');return}const value=Math.round(n);const d=today();const found=state.entries.find(e=>e.date===d);if(found){found.amount+=value;if(homeTag){found.tagAmounts=applyTagAmount(found.tagAmounts||{},homeTag,value);if(!found.tag)found.tag=homeTag}}else state.entries.push({date:d,amount:value,tag:homeTag,tagAmounts:homeTag?applyTagAmount({},homeTag,value):undefined});save(state);render()};
 document.querySelectorAll<HTMLButtonElement>('[data-home-tag]').forEach(b=>b.addEventListener('click',()=>{homeTag=homeTag===b.dataset.homeTag?undefined:b.dataset.homeTag as SpendTag;render()}));
 document.querySelector('#add')!.addEventListener('click',add);amount.addEventListener('keydown',e=>{if(e.key==='Enter')add()});
 document.querySelectorAll<HTMLButtonElement>('[data-date]').forEach(b=>b.addEventListener('click',()=>{const targetYm=(b.dataset.date||'').slice(0,7);if(!canEditMonth(Object.keys(state.closes),targetYm)){alert('마감된 월은 수정할 수 없습니다.');return}state.entries=state.entries.filter(e=>e.date!==b.dataset.date);save(state);render()}));
 document.querySelectorAll<HTMLButtonElement>('[data-heat-date]').forEach(b=>b.addEventListener('click',()=>{selectedHeatDate=b.dataset.heatDate||null;render()}));
 document.querySelector('#closeMonthPicker')?.addEventListener('click',()=>{monthPickerOpen=false;render()});
 document.querySelector('#goCurrentMonth')?.addEventListener('click',()=>{viewMonth=ymNow();monthPickerOpen=false;render()});
 document.querySelector('#prevYear')?.addEventListener('click',()=>{viewMonth=shiftYm(viewMonth,-12);render()});
 document.querySelector('#nextYear')?.addEventListener('click',()=>{viewMonth=shiftYm(viewMonth,12);render()});
 document.querySelectorAll<HTMLButtonElement>('[data-pick-month]').forEach(b=>b.addEventListener('click',()=>{viewMonth=b.dataset.pickMonth||ymNow();monthPickerOpen=false;render()}));
 document.querySelector('#closeDay')?.addEventListener('click',()=>{selectedHeatDate=null;render()});
 document.querySelectorAll<HTMLButtonElement>('.tag-option').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tag-option').forEach(x=>x.classList.remove('active'));b.classList.add('active')}));
 document.querySelector('#saveDay')?.addEventListener('click',()=>{if(!selectedHeatDate)return;if(!canEditMonth(Object.keys(state.closes),selectedHeatDate.slice(0,7))){alert('마감된 월은 수정할 수 없습니다.');return}const input=document.querySelector<HTMLInputElement>('#dayAmount')!;const n=Number(input.value.replace(/,/g,''));if(!Number.isFinite(n)||n<0){alert('0원 이상의 금액을 입력하세요.');return}const note=(document.querySelector<HTMLInputElement>('#dayNote')?.value||'').trim().slice(0,60);const tag=(document.querySelector<HTMLButtonElement>('.tag-option.active')?.dataset.tag||undefined) as SpendTag|undefined;state.entries=state.entries.filter(e=>e.date!==selectedHeatDate);if(n>0)state.entries.push({date:selectedHeatDate,amount:Math.round(n),note:note||undefined,tag,tagAmounts:tag?{[tag]:Math.round(n)}:undefined});save(state);selectedHeatDate=null;render()});
 document.querySelector('#deleteDay')?.addEventListener('click',()=>{if(!selectedHeatDate)return;if(!canEditMonth(Object.keys(state.closes),selectedHeatDate.slice(0,7))){alert('마감된 월은 수정할 수 없습니다.');return}if(confirm('이날 기록을 삭제할까요?')){state.entries=state.entries.filter(e=>e.date!==selectedHeatDate);save(state);selectedHeatDate=null;render()}});
 document.querySelector('#reset')!.addEventListener('click',()=>{if(!canEditMonth(Object.keys(state.closes),viewMonth)){alert('마감된 월은 초기화할 수 없습니다.');return}if(confirm(monthLabel(viewMonth)+' 기록을 모두 삭제할까요?')){state.entries=state.entries.filter(e=>!e.date.startsWith(viewMonth));save(state);render()}});
 document.querySelector('#closeMonth')?.addEventListener('click',()=>{if(!canClose||close)return;if(confirm('이번 달을 마감하면 기록을 수정할 수 없습니다. 마감할까요?')){const savedValue=c.budget-c.cumulative;state.closes[ymNow()]={ym:ymNow(),budget:c.budget,actual:c.cumulative,saved:savedValue,savingsRate:c.budget?savedValue/c.budget*100:0,closedAt:new Date().toISOString()};save(state);render()}});
 document.querySelector('#applyNext')!.addEventListener('click',()=>{if(!suggestion)return;state.budgets[nextMonthKey()]=suggestion;save(state);alert(monthLabel(nextMonthKey())+' 목표를 '+won(suggestion)+'으로 저장했습니다.');render()});
 document.querySelector('#rulesToggle')?.addEventListener('click',()=>document.querySelector('#rulesPanel')?.classList.toggle('hidden'));
 const showTab=(tab:string)=>{activeTab=tab;document.querySelectorAll('.tab-view').forEach(v=>v.classList.add('hidden'));document.querySelector('#tab-'+tab)?.classList.remove('hidden');document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',(b as HTMLElement).dataset.tab===tab));window.scrollTo({top:0,behavior:'smooth'})};
 document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab||'home')));
 document.querySelectorAll<HTMLButtonElement>('#prevMonth').forEach(b=>b.addEventListener('click',()=>{viewMonth=shiftYm(viewMonth,-1);render()}));
 document.querySelectorAll<HTMLButtonElement>('#nextMonth').forEach(b=>b.addEventListener('click',()=>{viewMonth=shiftYm(viewMonth,1);render()}));
 document.querySelectorAll<HTMLButtonElement>('#monthPickerBtn').forEach(b=>b.addEventListener('click',()=>{monthPickerOpen=true;render()}));
 let touchX=0,touchY=0;document.querySelectorAll<HTMLElement>('.month-swipe-zone').forEach(z=>{z.addEventListener('touchstart',e=>{touchX=e.touches[0].clientX;touchY=e.touches[0].clientY},{passive:true});z.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-touchX,dy=e.changedTouches[0].clientY-touchY;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.25){viewMonth=shiftYm(viewMonth,dx<0?1:-1);render()}},{passive:true})});
 showTab(activeTab);
 document.querySelector('#install')!.addEventListener('click',async()=>{if(deferredPrompt){await deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else{alert('iPhone은 Safari 공유 버튼 → 홈 화면에 추가, Android/Chrome은 브라우저 메뉴 → 앱 설치를 선택하세요.')}});
 document.querySelector('#info')!.addEventListener('click',()=>showTab('settings'));document.querySelector('#whyDecision')?.addEventListener('click',()=>showTab('analysis'));document.querySelector('#settingsBudget')?.addEventListener('click',()=>{showTab('home');setTimeout(()=>document.querySelector('#budgetPanel')?.classList.remove('hidden'),50)});document.querySelector('#settingsInstall')?.addEventListener('click',async()=>{if(deferredPrompt){await deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else{alert('iPhone은 Safari 공유 버튼 → 홈 화면에 추가, Android/Chrome은 브라우저 메뉴 → 앱 설치를 선택하세요.')}});
 document.querySelector('#startApp')?.addEventListener('click',()=>{state.onboarded=true;save(state);render()});
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e as InstallPromptEvent});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
render();runCertification();