import {DB_URL,PUBLIC_KEY} from './config.js';
import {groupRates,pointMetrics} from './rates.js';
import {chartSVG,formatNumber as fmt,formatPercent} from './chart.js';
const specs=[['USD','미국 달러','원 / 1달러','#2f7337'],['JPY','일본 엔','원 / 100엔','#ed7d31'],['EUR','유로','원 / 1유로','#b70d1d'],['CNY','중국 위안','원 / 1위안','#1399be'],['USDJPY','엔/달러 환산','엔 / 1달러','#9a3ca2']];
const $=id=>document.getElementById(id);
let data=[],filtered=[],shown=30,preset=365,view='summary',layout='fit',showValues=true;
let zoomKey='USD',zoomPeriod='selection',zoomMetric='rate',zoomLayout='fit',zoomValues=true,zoomPoints=[];
let scrollSync=false,resizeTimer;
function renderPrint(){
 const end=$('print-to').value||$('to').value||data.at(-1)?.date||today();$('print-to').value=end;
 const d=new Date(end+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));d.setUTCDate(d.getUTCDate()+1);
 const start=d.toISOString().slice(0,10),points=data.filter(r=>r.date>=start&&r.date<=end);
 $('print-now').disabled=!points.length;
 $('print-sheet').innerHTML=`<div class="print-heading"><h2>환율 Trend</h2><div>MH머트리얼즈㈜<br>${start} ~ ${end} · ${points.length}개 고시일</div></div>${specs.map(([key,name,,color])=>`<section class="print-chart"><h3>${codeLabel(key)} (${name})</h3>${chartSVG(points,key,name,color,{width:1400,height:250,labels:true,interactive:false,all:data,print:true}).html}</section>`).join('')}<table class="print-rates"><thead><tr><th>일자</th>${points.map(r=>`<th>${r.date.slice(5)}</th>`).join('')}</tr></thead><tbody>${specs.map(([key])=>`<tr><th>${codeLabel(key)}</th>${points.map(r=>`<td>${fmt(r[key])}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="print-source">자료: BNK부산은행 최초 고시 1회차 매매기준율 · JPY는 100엔 기준 · USD/JPY = USD ÷ JPY(100) × 100<br>휴일·미고시일 제외. ${points.length?'조회 구간의 모든 고시값을 표시합니다.':'선택한 한 달에 검증된 자료가 없습니다.'}</p>`;
}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function isoAgo(end,days){const d=new Date(end+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10)}
const codeLabel=key=>key==='JPY'?'JPY(100)':key==='USDJPY'?'USD/JPY':key;
const signClass=value=>value>0?'up':value<0?'down':'flat';
const signed=value=>(value>0?'+':'')+fmt(value);
function changeText(change){return change?`${signed(change.amount)} (${formatPercent(change.percent)})`:'비교 자료 없음'}
function legend(color){return `<svg class="series-dot" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="${color}"/></svg>`}
function scopePoints(scope){return scope==='zoom'?zoomPoints:filtered}
function readoutText(points,key,index){
 const info=pointMetrics(data,points,key,index);if(!info)return '선택 기간에 고시 자료가 없습니다.';
 return `${info.point.date} · ${codeLabel(key)} ${fmt(info.point[key])} · 전 고시일 대비 ${changeText(info.daily)} · 기간 첫 고시일(${info.first.date}) 대비 ${changeText(info.period)}`;
}
function statusText(){
 if(!data.length)return '아직 검증된 고시 자료가 없습니다. 자동 수집 결과를 기다려 주세요.';
 const lag=Math.round((Date.parse(today())-Date.parse(data.at(-1).date))/86400000);$('status').className=lag>4?'error':'';
 return `검증된 1회차 자료 ${data.length}개 고시일 · 선택 기간 ${filtered.length}개 고시일${lag>4?' · 최신 고시일이 4일 이상 지났습니다. 수집 상태를 확인해 주세요.':''}`;
}
function render(){
 const from=$('from').value,to=$('to').value;
 if(from&&to&&from>to){$('status').textContent='시작일은 종료일보다 이전이어야 합니다.';$('status').className='error';return}
 filtered=data.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to));shown=30;
 $('main-content').dataset.view=view;$('detail-controls').hidden=view!=='detail';
 $('print-view').hidden=view!=='print';if(view==='print')renderPrint();
 document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 $('view-description').textContent=view==='summary'?'주요 통화의 환율과 변동률을 한눈에 확인합니다.':'차트를 한 줄씩 넓게 표시합니다. 일자별 숫자는 가로로 펼쳐 확인할 수 있습니다.';
 renderCharts();renderTable();$('download').disabled=!filtered.length;$('status').textContent=statusText();
 if($('zoom-dialog').open)renderZoom();
}
function renderCharts(preserveScroll=false){
 const oldScroll=$('charts').querySelector('.chart-scroll');
 const oldRatio=oldScroll&&oldScroll.scrollWidth>oldScroll.clientWidth?oldScroll.scrollLeft/(oldScroll.scrollWidth-oldScroll.clientWidth):1;
 const detail=view==='detail',spread=detail&&layout==='spread',columns=detail||window.innerWidth<=850?1:2;
 const available=Math.max(300,($('charts').clientWidth-(columns-1)*18)/columns-42);
 $('charts').innerHTML=specs.map(([key,name,unit,color],i)=>{
  const info=pointMetrics(data,filtered,key,filtered.length-1),vals=filtered.map(r=>r[key]);
  const graph=chartSVG(filtered,key,name,color,{width:columns===2&&i===4?$('charts').clientWidth-42:available,height:detail?260:205,spread,labels:detail&&showValues,all:data,interactive:detail});
  return `<article class="chart" data-currency="${key}"><div class="charttop"><div><h3><button class="currency-title" data-zoom="${key}">${legend(color)}${codeLabel(key)} <span>${name}</span></button></h3><p class="sub">${unit}</p></div><div class="quote"><b>${info?fmt(info.point[key]):'—'}</b><small>${info?info.point.date+' 기준':'자료 없음'}</small><button class="expand-chart" data-zoom="${key}" aria-label="${codeLabel(key)} 차트 확대">확대 ↗</button></div></div><div class="change-strip"><span>전 고시일 대비 <strong class="${signClass(info?.daily?.percent)}">${changeText(info?.daily)}</strong></span><span>기간 첫 고시일 대비 <strong class="${signClass(info?.period?.percent)}">${changeText(info?.period)}</strong></span></div><div class="chart-scroll ${spread?'is-spread':''}" data-scroll-group="main" tabindex="${spread?0:-1}" aria-label="${name} 차트, 좌우로 이동">${graph.html}</div><div class="point-readout" id="readout-main-${key}" aria-live="polite">${readoutText(filtered,key,filtered.length-1)}</div><div class="summary"><span>${vals.length?'기간 최저 '+fmt(Math.min(...vals)):'자료 없음'}</span><span>${vals.length?'기간 최고 '+fmt(Math.max(...vals)):''}</span><span>${filtered.length}개 고시일${detail&&showValues&&graph.labelCount<filtered.length?' · 숫자 '+graph.labelCount+'개 표시':''}</span></div></article>`;
 }).join('');
 $('timeline-control').hidden=!spread||!filtered.length;
 $('layout-note').textContent=spread?'모든 고시일의 숫자를 표시합니다. 이동 막대나 차트의 가로 스크롤로 과거·최근 자료를 함께 이동할 수 있습니다.':'숫자가 겹치면 간격을 두어 표시합니다. 모든 숫자를 보려면 가로로 펼쳐 보기를 선택하세요.';
 document.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layout===layout)));
 attachScrollSync();if(spread)requestAnimationFrame(()=>setMainScroll(preserveScroll?oldRatio:1));
}
function renderTable(){
 $('summary-table').hidden=view==='detail';$('detail-table').hidden=view!=='detail';
 const rows=filtered.slice().reverse().slice(0,shown);
 $('rows').innerHTML=rows.length?rows.map(r=>`<tr><td>${r.date}</td>${specs.map(([c])=>`<td>${fmt(r[c])}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="6">선택 기간의 자료가 없습니다.</td></tr>';
 $('more').hidden=view==='detail'||shown>=filtered.length;$('history-title').textContent=view==='detail'?'일자별 수치 · 좌우로 이동':'일자별 고시 내역';
 $('detail-table').innerHTML=filtered.length?`<table class="trend-table"><caption class="sr-only">통화별 일자별 환율, 고시일 오름차순</caption><thead><tr><th scope="col">통화 / 고시일</th>${filtered.map(r=>`<th scope="col">${r.date}</th>`).join('')}</tr></thead><tbody>${specs.map(([key])=>`<tr><th scope="row">${codeLabel(key)}</th>${filtered.map(r=>`<td>${fmt(r[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p class="empty">선택 기간의 자료가 없습니다.</p>';
 $('detail-table').dataset.scrollGroup='main';attachScrollSync();if(view==='detail'&&layout==='spread')requestAnimationFrame(()=>setMainScroll(1));
}
function setMainScroll(ratio){
 if(scrollSync)return;scrollSync=true;
 document.querySelectorAll('[data-scroll-group="main"]').forEach(el=>el.scrollLeft=ratio*Math.max(0,el.scrollWidth-el.clientWidth));$('timeline').value=Math.round(ratio*100);
 requestAnimationFrame(()=>scrollSync=false);
}
function attachScrollSync(){document.querySelectorAll('[data-scroll-group="main"]').forEach(el=>{el.onscroll=()=>{if(view==='detail'&&layout==='spread'&&!scrollSync&&el.scrollWidth>el.clientWidth)setMainScroll(el.scrollLeft/(el.scrollWidth-el.clientWidth))}})}
function setPeriod(days){preset=days;$('to').value=today();$('from').value=days==='all'?(data[0]?.date||''):isoAgo(today(),Number(days)-1);document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.days===String(days))));render()}
function openZoom(key){zoomKey=key;zoomPeriod='selection';zoomMetric='rate';zoomLayout='fit';zoomValues=true;$('zoom-values').checked=true;$('zoom-dialog').showModal();document.body.classList.add('dialog-active');renderZoom()}
function renderZoom(){
 const [key,name,unit,color]=specs.find(([key])=>key===zoomKey),end=$('to').value||data.at(-1)?.date||today();
 zoomPoints=zoomPeriod==='selection'?filtered:data.filter(r=>r.date>=isoAgo(end,Number(zoomPeriod)-1)&&r.date<=end);
 const info=pointMetrics(data,zoomPoints,key,zoomPoints.length-1),vals=zoomPoints.map(r=>r[key]);
 $('zoom-title').textContent=codeLabel(key)+' · '+name;$('zoom-range').textContent=zoomPoints.length?`${zoomPoints[0].date} ~ ${zoomPoints.at(-1).date} · ${zoomPoints.length}개 고시일`:'선택 기간의 자료가 없습니다.';
 $('zoom-stats').innerHTML=`<div><span>기간 마지막 환율 · ${unit}</span><strong>${info?fmt(info.point[key]):'—'}</strong><small>${info?.point.date||''}</small></div><div><span>전 고시일 대비</span><strong class="${signClass(info?.daily?.percent)}">${info?.daily?formatPercent(info.daily.percent):'—'}</strong><small>${info?.daily?signed(info.daily.amount)+' · '+info.previous.date+' 대비':'비교 자료 없음'}</small></div><div><span>기간 첫 고시일 대비</span><strong class="${signClass(info?.period?.percent)}">${info?formatPercent(info.period.percent):'—'}</strong><small>${info?signed(info.period.amount)+' · '+info.first.date+' 대비':''}</small></div><div><span>기간 최저 ~ 최고</span><strong class="range-stat">${vals.length?fmt(Math.min(...vals))+' ~ '+fmt(Math.max(...vals)):'—'}</strong><small>${unit}</small></div>`;
 $('zoom-baseline').textContent=info?`${zoomMetric==='percent'?'변동률 차트 기준':'기간 변동률 기준'}: ${info.first.date} ${fmt(info.first[key])} ${unit}. 점을 선택하면 해당 일자의 변동을 확인할 수 있습니다.`:'';
 const graph=chartSVG(zoomPoints,key,name,color,{width:Math.max(300,$('zoom-chart-host').clientWidth),height:Math.max(230,Math.min(360,window.innerHeight-450)),spread:zoomLayout==='spread',labels:zoomValues,metric:zoomMetric,scope:'zoom',all:data});
 $('zoom-chart-host').innerHTML=`<div class="chart-scroll ${zoomLayout==='spread'?'is-spread':''}" tabindex="${zoomLayout==='spread'?0:-1}" aria-label="${name} 확대 차트, 좌우로 이동">${graph.html}</div>`;
 $('readout-zoom').textContent=readoutText(zoomPoints,key,zoomPoints.length-1);
 $('zoom-rows').innerHTML=zoomPoints.length?zoomPoints.map((point,index)=>{const m=pointMetrics(data,zoomPoints,key,index);return `<tr><td>${point.date}</td><td>${fmt(point[key])}</td><td class="${signClass(m.daily?.percent)}">${m.daily?signed(m.daily.amount):'—'}</td><td class="${signClass(m.daily?.percent)}">${m.daily?formatPercent(m.daily.percent):'—'}</td><td class="${signClass(m.period?.percent)}">${formatPercent(m.period.percent)}</td></tr>`}).join(''):'<tr><td colspan="5">선택 기간의 자료가 없습니다.</td></tr>';
 for(const [attr,value] of [['currency',zoomKey],['period',zoomPeriod],['metric',zoomMetric],['layout',zoomLayout]])document.querySelectorAll(`[data-zoom-${attr}]`).forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute('data-zoom-'+attr)===value)));
 if(zoomLayout==='spread')requestAnimationFrame(()=>{const el=$('zoom-chart-host').querySelector('.chart-scroll');el.scrollLeft=el.scrollWidth-el.clientWidth});
}
function pointInteraction(event){
 const point=event.target.closest('[data-point-index]');if(!point)return;
 if(event.type==='keydown'){
  const index=Number(point.dataset.pointIndex),points=scopePoints(point.dataset.scope);let next=index;
  if(event.key==='ArrowLeft')next=Math.max(0,index-1);else if(event.key==='ArrowRight')next=Math.min(points.length-1,index+1);else if(event.key==='Home')next=0;else if(event.key==='End')next=points.length-1;else if(event.key!=='Enter'&&event.key!==' ')return;
  event.preventDefault();const svg=point.closest('svg');svg.querySelectorAll('[data-point-index]').forEach(el=>{el.setAttribute('tabindex','-1');el.setAttribute('aria-hidden','true')});const target=svg.querySelector(`[data-point-index="${next}"]`);target.setAttribute('tabindex','0');target.setAttribute('aria-hidden','false');target.focus();return;
 }
 const points=scopePoints(point.dataset.scope),key=point.dataset.key,index=Number(point.dataset.pointIndex);$(point.dataset.scope==='zoom'?'readout-zoom':'readout-main-'+key).textContent=readoutText(points,key,index);
}
async function load(){
 $('refresh').disabled=true;$('status').className='';$('status').textContent='검증된 환율을 불러오는 중입니다.';
 try{
  let all=[];
  for(let offset=0;;offset+=1000){const q=new URLSearchParams({select:'rate_date,currency,unit,base_rate,round_no,announced_at,verification_status',verification_status:'eq.verified',round_no:'eq.1',order:'rate_date.asc,currency.asc',offset:String(offset),limit:'1000'});const response=await fetch(DB_URL+'/rest/v1/fx_rates?'+q,{headers:{apikey:PUBLIC_KEY},cache:'no-store'});if(!response.ok)throw new Error(`조회 응답 ${response.status}`);const page=await response.json();all.push(...page);if(page.length<1000)break;if(offset>=100000)throw new Error('자료 범위를 초과했습니다.')}
  data=groupRates(all);$('asof').textContent=data.at(-1)?.date||'고시 자료 없음';$('announcement').textContent=data.at(-1)?.announced?new Date(data.at(-1).announced).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' 고시':'';
  if(!$('to').value)setPeriod(preset);else render();
 }catch(e){data=[];filtered=[];$('charts').innerHTML='<p class="empty">자료를 불러오지 못했습니다. 새로고침으로 다시 조회해 주세요.</p>';$('rows').innerHTML='';$('detail-table').innerHTML='';$('download').disabled=true;$('asof').textContent='조회 실패';$('announcement').textContent='';$('status').className='error';$('status').textContent='환율 조회 연결에 실패했습니다. '+e.message;if($('zoom-dialog').open)renderZoom()}
 finally{$('refresh').disabled=false}
}
document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>setPeriod(b.dataset.days)));
document.querySelectorAll('button[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;if(view==='print')$('print-to').value=$('to').value;render()}));
$('print-refresh').addEventListener('click',renderPrint);$('print-now').addEventListener('click',()=>window.print());
window.addEventListener('beforeprint',renderPrint);
document.querySelectorAll('[data-layout]').forEach(b=>b.addEventListener('click',()=>{layout=b.dataset.layout;renderCharts();renderTable()}));
$('show-values').addEventListener('change',e=>{showValues=e.target.checked;renderCharts(true)});$('timeline').addEventListener('input',e=>setMainScroll(Number(e.target.value)/100));
$('apply').addEventListener('click',()=>{document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed','false'));render()});$('refresh').addEventListener('click',load);$('more').addEventListener('click',()=>{shown+=30;renderTable()});
$('charts').addEventListener('click',event=>{const button=event.target.closest('[data-zoom]');if(button)openZoom(button.dataset.zoom)});
for(const host of [$('charts'),$('zoom-chart-host')])for(const type of ['pointerover','focusin','click','keydown'])host.addEventListener(type,pointInteraction);
$('zoom-close').addEventListener('click',()=>$('zoom-dialog').close());$('zoom-dialog').addEventListener('close',()=>document.body.classList.remove('dialog-active'));
document.querySelectorAll('[data-zoom-currency]').forEach(b=>b.addEventListener('click',()=>{zoomKey=b.dataset.zoomCurrency;renderZoom()}));document.querySelectorAll('[data-zoom-period]').forEach(b=>b.addEventListener('click',()=>{zoomPeriod=b.dataset.zoomPeriod;renderZoom()}));document.querySelectorAll('[data-zoom-metric]').forEach(b=>b.addEventListener('click',()=>{zoomMetric=b.dataset.zoomMetric;renderZoom()}));document.querySelectorAll('[data-zoom-layout]').forEach(b=>b.addEventListener('click',()=>{zoomLayout=b.dataset.zoomLayout;renderZoom()}));$('zoom-values').addEventListener('change',e=>{zoomValues=e.target.checked;renderZoom()});
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{renderCharts(true);if($('zoom-dialog').open)renderZoom()},150)});
$('download').addEventListener('click',()=>{const lines=['고시일,USD_KRW,JPY100_KRW,EUR_KRW,CNY_KRW,USDJPY_JPY'];for(const r of filtered)lines.push([r.date,...specs.map(([c])=>r[c].toFixed(2))].join(','));const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`MH_환율_${$('from').value}_${$('to').value}.csv`;a.click();URL.revokeObjectURL(url)});
load();
