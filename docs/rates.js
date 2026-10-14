export function groupRates(rows){
 const groups=new Map();
 for(const r of rows){
  if(!['USD','JPY','EUR','CNY'].includes(r.currency)||r.round_no!==1||r.verification_status!=='verified')continue;
  const value=Number(r.base_rate);
  if(!Number.isFinite(value)||value<=0||r.unit!==(r.currency==='JPY'?100:1))continue;
  const g=groups.get(r.rate_date)||{date:r.rate_date,announced:r.announced_at};
  if(Object.hasOwn(g,r.currency)){g.invalid=true;continue}
  g[r.currency]=value;groups.set(r.rate_date,g);
 }
 return [...groups.values()].filter(g=>!g.invalid&&['USD','JPY','EUR','CNY'].every(c=>Number.isFinite(g[c]))).map(g=>({...g,USDJPY:g.USD/g.JPY*100})).sort((a,b)=>a.date.localeCompare(b.date));
}

export function rateChange(value,base){
 if(!Number.isFinite(value)||!Number.isFinite(base)||base<=0)return null;
 return {amount:value-base,percent:(value/base-1)*100};
}

export function pointMetrics(all,points,key,index){
 const point=points[index];
 if(!point)return null;
 const fullIndex=all.findIndex(row=>row.date===point.date);
 const previous=fullIndex>0?all[fullIndex-1]:null;
 return {point,first:points[0],previous,daily:rateChange(point[key],previous?.[key]),period:rateChange(point[key],points[0]?.[key])};
}
