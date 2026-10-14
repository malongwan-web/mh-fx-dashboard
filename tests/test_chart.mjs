import assert from 'node:assert/strict';
import {rateChange,pointMetrics,groupRates} from '../docs/rates.js';
import {chartSVG,chartDomain} from '../docs/chart.js';
const all=[{date:'2026-10-01',USD:100},{date:'2026-10-02',USD:110},{date:'2026-10-06',USD:99}];
assert.equal(rateChange(110,100).amount,10);assert.ok(Math.abs(rateChange(110,100).percent-10)<1e-9);
assert.equal(rateChange(1,0),null);assert.equal(rateChange(1,undefined),null);
let m=pointMetrics(all,all,'USD',2);assert.ok(Math.abs(m.daily.percent+10)<1e-9);assert.ok(Math.abs(m.period.percent+1)<1e-9);
m=pointMetrics(all,all.slice(2),'USD',0);assert.ok(Math.abs(m.daily.percent+10)<1e-9);assert.equal(m.period.percent,0);assert.equal(m.previous.date,'2026-10-02');
assert.equal(pointMetrics(all,[],'USD',0),null);
for(const points of [all,all.slice(0,1),[{date:'2026-10-01',USD:100},{date:'2026-10-02',USD:100}]])for(const metric of ['rate','percent']){
 const result=chartSVG(points,'USD','달러','#005baa',{labels:true,metric});assert.ok(!/NaN|Infinity/.test(result.html));assert.equal((result.html.match(/class="chart-point"/g)||[]).length,points.length);
}
const many=Array.from({length:245},(_,i)=>({date:new Date(Date.UTC(2025,9,15+i)).toISOString().slice(0,10),USD:1300+i/10}));
const spread=chartSVG(many,'USD','달러','#005baa',{spread:true,labels:true});assert.equal(spread.labelCount,245);assert.equal((spread.html.match(/class="value-label"/g)||[]).length,245);
const fit=chartSVG(many,'USD','달러','#005baa',{width:1100,labels:true});assert.ok(fit.labelCount<245);assert.equal((fit.html.match(/class="chart-point"/g)||[]).length,245);
const domain=chartDomain([0,0],true);assert.ok(domain.max>domain.min&&domain.step>0);
const raw=['USD','JPY','EUR','CNY'].map((currency,i)=>({rate_date:'2026-10-14',currency,unit:currency==='JPY'?100:1,base_rate:[1340.5,846.57,1500.96,200.23][i],round_no:1,verification_status:'verified'}));
const cross=groupRates(raw);assert.equal(cross[0].USDJPY.toFixed(2),'158.34');assert.equal(pointMetrics(cross,cross,'USDJPY',0).period.percent,0);
console.log('PASS: daily vs fixing, period baseline, one-day selection, flat/empty charts, dense labels, full-resolution points, cross-rate');
