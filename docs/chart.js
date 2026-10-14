import {pointMetrics} from './rates.js';
const numberFormatter=new Intl.NumberFormat('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2});
export const formatNumber=value=>numberFormatter.format(value);
export const formatPercent=value=>(value>0?'+':'')+value.toFixed(2)+'%';
export const escapeHTML=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function chartDomain(values,percent=false){
 const lo=Math.min(...values),hi=Math.max(...values);
 const pad=Math.max((hi-lo)*.14,percent ? .1 : Math.max(Math.abs(hi)*.002,.01));
 const rough=(hi-lo+2*pad)/4,power=10**Math.floor(Math.log10(rough));
 const step=[1,2,2.5,5,10].map(x=>x*power).find(x=>x>=rough)||power*10;
 return {min:Math.floor((lo-pad)/step)*step,max:Math.ceil((hi+pad)/step)*step,step};
}
export function chartSVG(points,key,name,color,{width=1000,height=260,spread=false,labels=false,metric='rate',scope='main',all=points,interactive=true}={}){
 if(!points.length)return {html:'<div class="empty">선택 기간에 검증된 고시 자료가 없습니다.</div>',labelCount:0};
 const left=spread?158:78,right=spread?38:35,top=32,bottom=34;
 const w=spread?120+Math.max(2,points.length)*76:Math.max(300,width),h=height,plotW=w-left-right,plotH=h-top-bottom;
 const base=points[0][key],values=points.map(p=>metric==='percent'?(p[key]/base-1)*100:p[key]);
 const domain=chartDomain(values,metric==='percent');
 const x=i=>points.length===1?left+plotW/2:left+i*plotW/(points.length-1),y=value=>top+(domain.max-value)/(domain.max-domain.min)*plotH;
 const labelStep=spread?1:Math.max(1,Math.ceil((points.length-1)*48/plotW));
 const labelIndices=new Set(points.map((_,i)=>i).filter(i=>i%labelStep===0||i===points.length-1));
 if(!spread)for(const i of labelIndices)if(i!==points.length-1&&x(points.length-1)-x(i)<48)labelIndices.delete(i);
 const dateStep=spread?1:Math.max(1,Math.ceil((points.length-1)*95/plotW));
 const valueText=value=>metric==='percent'?formatPercent(value):formatNumber(value);
 let marks='';
 for(let i=0;i<12;i++){
  const value=domain.min+domain.step*i;if(value>domain.max+domain.step*.001)break;const yy=y(value);
  marks+=`<line class="grid" x1="${left}" x2="${w-right}" y1="${yy}" y2="${yy}"/><text class="axis-label" x="${left-10}" y="${yy+4}" text-anchor="end">${metric==='percent'?value.toFixed(2)+'%':formatNumber(value)}</text>`;
 }
 if(metric==='percent')marks+=`<line class="zero-line" x1="${left}" x2="${w-right}" y1="${y(0)}" y2="${y(0)}"/>`;
 marks+=`<polyline points="${points.map((_,i)=>`${x(i)},${y(values[i])}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>`;
 points.forEach((point,i)=>{
  const info=pointMetrics(all,points,key,i);
  const description=`${point.date} ${name} ${formatNumber(point[key])}, 전 고시일 대비 ${info.daily?formatPercent(info.daily.percent):'비교 자료 없음'}, 기간 첫 고시일 대비 ${formatPercent(info.period.percent)}`;
  const interaction=interactive?`role="button" tabindex="${i===points.length-1?0:-1}" aria-hidden="${i===points.length-1?'false':'true'}" data-point-index="${i}" data-key="${key}" data-scope="${scope}" aria-label="${escapeHTML(description)}"`:'aria-hidden="true"';
  marks+=`<g class="chart-point" ${interaction}><circle class="hit-target" cx="${x(i)}" cy="${y(values[i])}" r="11" fill="transparent"/><circle class="point-marker" cx="${x(i)}" cy="${y(values[i])}" r="${points.length<3?4:2.8}" fill="${color}"/><title>${escapeHTML(description)}</title>`;
  if(labels&&labelIndices.has(i))marks+=`<text class="value-label" x="${x(i)}" y="${Math.max(15,y(values[i])-10)}" text-anchor="middle">${valueText(values[i])}</text>`;
  marks+='</g>';
  if(i%dateStep===0||i===points.length-1){
   if(!spread&&i!==points.length-1&&points.length-1-i<dateStep*.65)return;
   marks+=`<text class="date-label" x="${x(i)}" y="${h-10}" text-anchor="middle">${spread||i===0||i===points.length-1?point.date:point.date.slice(5)}</text>`;
  }
 });
 return {html:`<svg class="trend-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="${interactive?'group':'img'}" aria-label="${escapeHTML(name)}, ${points[0].date}부터 ${points.at(-1).date}까지 ${points.length}개 고시일${metric==='percent'?', 기간 첫 고시일 기준 변동률':''}">${marks}</svg>`,labelCount:labels?labelIndices.size:0};
}
