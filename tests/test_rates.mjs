import assert from 'node:assert/strict';
import {groupRates} from '../docs/rates.js';
const rows=['USD','JPY','EUR','CNY'].map((currency,i)=>({rate_date:'2026-10-14',currency,unit:currency==='JPY'?100:1,base_rate:[1340.50,846.57,1500.96,200.23][i],round_no:1,verification_status:'verified',announced_at:'2026-10-14T08:29:20+09:00'}));
assert.equal(groupRates(rows)[0].USDJPY.toFixed(2),'158.34');
assert.equal(groupRates(rows.slice(0,3)).length,0);
assert.equal(groupRates([...rows,rows[0]]).length,0);
for(const change of [{verification_status:'pending'},{round_no:999},{unit:100},{base_rate:0},{base_rate:Infinity}]){
 assert.equal(groupRates(rows.map((r,i)=>i===0?{...r,...change}:r)).length,0);
}
console.log('PASS: cross-rate, complete sets, duplicate, verification, round, units, invalid values');
