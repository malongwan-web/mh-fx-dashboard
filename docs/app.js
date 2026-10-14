import {DB_URL,PUBLIC_KEY} from './config.js';
import {groupRates} from './rates.js';
const specs=[['USD','미국 달러','원 / 1달러','#005baa'],['JPY','일본 엔','원 / 100엔','#518932'],['EUR','유로','원 / 1유로','#7354ac'],['CNY','중국 위안','원 / 1위안','#bf7a17'],['USDJPY','USD/JPY 환산','엔 / 1달러','#137f8b']];
const $=id=>document.getElementById(id),fmt=n=>new Intl.NumberFormat('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
let data=[],filtered=[],shown=30,preset=30;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function isoAgo(end,days){const d=new Date(end+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10)}
function svgChart(points,key,name,color){
 if(!points.length)return '<div class="empty">선택 기간에 검증된 고시 자료가 없습니다.</div>';
 const vals=points.map(x=>x[key]),lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max((hi-lo)*.18,hi*.002),min=lo-pad,max=hi+pad;
 const w=620,h=210,left=72,right=25,top=13,bottom=31,plotW=w-left-right,plotH=h-top-bottom;
 const start=Date.parse(points[0].date),end=Date.parse(points.at(-1).date);
 const x=d=>end===start?left+plotW/2:left+(Date.parse(d)-start)/(end-start)*plotW,y=v=>top+(max-v)/(max-min)*plotH;
 let marks='';
 for(let i=0;i<=3;i++){const v=min+(max-min)*i/3,yy=y(v);marks+=`<line class="grid" x1="${left}" x2="${w-right}" y1="${yy}" y2="${yy}"/><text x="${left-9}" y="${yy+4}" text-anchor="end">${fmt(v)}</text>`}
 const indices=[...new Set([0,Math.floor((points.length-1)/2),points.length-1])];
 marks+=indices.map(i=>`<text x="${x(points[i].date)}" y="${h-7}" text-anchor="middle">${points[i].date.slice(5)}</text>`).join('');
 const coords=points.map(p=>`${x(p.date)},${y(p[key])}`).join(' ');
 marks+=`<polyline points="${coords}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
 marks+=points.map(p=>`<circle cx="${x(p.date)}" cy="${y(p[key])}" r="${points.length<3?4:2.4}" fill="${color}"><title>${p.date}: ${fmt(p[key])}</title></circle>`).join('');
 return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${name}, ${points[0].date}부터 ${points.at(-1).date}까지 ${points.length}개 고시 자료">${marks}</svg>`;
}
function render(){
 const from=$('from').value,to=$('to').value;
 if(from&&to&&from>to){$('status').textContent='시작일은 종료일보다 이전이어야 합니다.';$('status').className='error';return}
 filtered=data.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to));shown=30;
 const latest=filtered.at(-1),previous=latest?data[data.findIndex(r=>r.date===latest.date)-1]:undefined;
 $('charts').innerHTML=specs.map(([key,name,unit,color])=>{
  const change=latest&&previous?latest[key]-previous[key]:null,percent=change!==null?change/previous[key]*100:null;
  const vals=filtered.map(r=>r[key]);
  return `<article class="chart"><div class="charttop"><div><h3><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" class="series-dot"><circle cx="5" cy="5" r="5" fill="${color}"/></svg>${key==='USDJPY'?'USD/JPY':key==='JPY'?'JPY(100)':key} <span>${name}</span></h3><p class="sub">${unit}</p></div><div class="quote"><b>${latest?fmt(latest[key]):'—'}</b><small class="${change>0?'up':change<0?'down':''}">${change===null?'전 고시일 비교 자료 없음':`${change>0?'▲':change<0?'▼':'—'} ${fmt(Math.abs(change))} (${percent>0?'+':''}${percent.toFixed(2)}%)`}</small></div></div>${svgChart(filtered,key,name,color)}<div class="summary"><span>${vals.length?'기간 최저 '+fmt(Math.min(...vals)):'자료 없음'}</span><span>${vals.length?'기간 최고 '+fmt(Math.max(...vals)):''}</span><span>${filtered.length}개 고시일</span></div></article>`;
 }).join('');
 $('download').disabled=!filtered.length;renderTable();
 if(data.length){const latestDate=data.at(-1).date,lag=Math.round((Date.parse(today())-Date.parse(latestDate))/86400000);$('status').className=lag>4?'error':'';$('status').textContent=`검증된 1회차 자료 ${data.length}개 고시일 · 선택 기간 ${filtered.length}개 고시일${lag>4?' · 최신 고시일이 4일 이상 지났습니다. 수집 상태를 확인해 주세요.':''}`}
}
function renderTable(){const rows=filtered.slice().reverse().slice(0,shown);$('rows').innerHTML=rows.length?rows.map(r=>`<tr><td>${r.date}</td>${['USD','JPY','EUR','CNY','USDJPY'].map(c=>`<td>${fmt(r[c])}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="6">선택 기간의 자료가 없습니다.</td></tr>';$('more').hidden=shown>=filtered.length}
function setPeriod(days){preset=days;$('to').value=today();$('from').value=days==='all'?(data[0]?.date||''):isoAgo(today(),Number(days)-1);document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.days===String(days))));render()}
async function load(){
 $('refresh').disabled=true;$('status').className='';$('status').textContent='검증된 환율을 불러오는 중입니다.';
 try{
  let all=[];
  for(let offset=0;;offset+=1000){const q=new URLSearchParams({select:'rate_date,currency,unit,base_rate,round_no,announced_at,verification_status',verification_status:'eq.verified',round_no:'eq.1',order:'rate_date.asc,currency.asc',offset:String(offset),limit:'1000'});const response=await fetch(DB_URL+'/rest/v1/fx_rates?'+q,{headers:{apikey:PUBLIC_KEY},cache:'no-store'});if(!response.ok)throw new Error(`조회 응답 ${response.status}`);const page=await response.json();all.push(...page);if(page.length<1000)break;if(offset>=100000)throw new Error('자료 범위를 초과했습니다.')}
  data=groupRates(all);$('asof').textContent=data.at(-1)?.date||'고시 자료 없음';$('announcement').textContent=data.at(-1)?.announced?new Date(data.at(-1).announced).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' 고시':'';
  if(!data.length){$('status').textContent='아직 검증된 고시 자료가 없습니다. 자동 수집 결과를 기다려 주세요.'}
  if(!$('to').value)setPeriod(preset);else render();
 }catch(e){data=[];filtered=[];$('charts').innerHTML='<p class="empty">자료를 불러오지 못했습니다. 새로고침으로 다시 조회해 주세요.</p>';$('rows').innerHTML='';$('download').disabled=true;$('asof').textContent='조회 실패';$('announcement').textContent='';$('status').className='error';$('status').textContent='환율 조회 연결에 실패했습니다. '+e.message}
 finally{$('refresh').disabled=false}
}
document.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>setPeriod(b.dataset.days)));
$('apply').addEventListener('click',()=>{document.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed','false'));render()});
$('refresh').addEventListener('click',load);$('more').addEventListener('click',()=>{shown+=30;renderTable()});
$('download').addEventListener('click',()=>{const lines=['고시일,USD_KRW,JPY100_KRW,EUR_KRW,CNY_KRW,USDJPY_JPY'];for(const r of filtered)lines.push([r.date,...['USD','JPY','EUR','CNY','USDJPY'].map(c=>r[c].toFixed(2))].join(','));const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`MH_환율_${$('from').value}_${$('to').value}.csv`;a.click();URL.revokeObjectURL(url)});
load();
