"""Live security and idempotence checks; no new rates or destructive mutations."""
import copy
import json
import os
from datetime import date
from decimal import Decimal
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import collect as c

def api(path, payload=None):
    request=Request(c.DB+'/rest/v1/'+path,data=None if payload is None else json.dumps(payload).encode(),
                    headers={'apikey':c.PUBLIC_KEY,'Content-Type':'application/json'})
    with urlopen(request,timeout=30) as response:
        return json.load(response)

def denied(fn, label, code=None):
    try:
        fn()
    except HTTPError as error:
        body=json.load(error)
        if code and body.get('code') != code:
            raise AssertionError(label+': unexpected rejection code '+str(body.get('code')))
        print('PASS '+label+' denied ('+str(error.code)+', '+str(body.get('code'))+')')
        return
    raise AssertionError(label+' was unexpectedly allowed')

before=api('fx_rates?select=rate_date,currency,unit,base_rate,round_no,announced_at,verification_status&order=rate_date,currency')
assert before and len(before)%4==0
assert all(r['verification_status']=='verified' and r['round_no']==1 and r['unit']==(100 if r['currency']=='JPY' else 1) for r in before)
print('PASS anonymous verified SELECT: '+str(len(before))+' rates')
denied(lambda:api('fx_rates',[]),'anonymous direct INSERT','42501')
denied(lambda:api('fx_collection_logs?select=id&limit=1'),'anonymous log SELECT','42501')
target=date.fromisoformat(max(r['rate_date'] for r in before))
rows,digest=c.fetch_rates(target)
expected={(r['rate_date'],r['currency']):(Decimal(str(r['base_rate'])),r['unit']) for r in before}
for r in rows:
    assert expected[(r['rate_date'],r['currency'])]==(Decimal(r['base_rate']),r['unit'])
print('PASS bank original vs database: all four latest rates match')
denied(lambda:c.rpc('0'*64,target,rows,digest),'wrong collector token','42501')
denied(lambda:c.rpc(None,target,rows,digest),'missing collector token','42501')
token=os.environ['FX_COLLECTOR_TOKEN']
result=c.rpc(token,target,rows,digest)
assert result=={'status':'unchanged','rows':0}
print('PASS authorized replay: unchanged, zero duplicated rows')
changed=copy.deepcopy(rows);changed[0]['base_rate']=str(Decimal(changed[0]['base_rate'])+Decimal('.01'))
denied(lambda:c.rpc(token,target,changed,digest),'collector overwriting an existing rate','P0001')
denied(lambda:c.rpc(token,target,rows[:-1],digest),'incomplete currency bundle','P0001')
after=api('fx_rates?select=rate_date,currency,unit,base_rate,round_no,announced_at,verification_status&order=rate_date,currency')
assert before==after
print('PASS all live rate rows unchanged by security checks')
evidence=Path('evidence/live-verification.json')
evidence.parent.mkdir(exist_ok=True)
evidence.write_text(json.dumps({'rates':len(before),'dates':len(before)//4,'latest':target.isoformat(),'bank_match':True,'anonymous_insert_denied':True,'anonymous_logs_denied':True,'invalid_token_denied':True,'replay_idempotent':True,'overwrite_denied':True,'partial_bundle_denied':True,'rows_unchanged':True},indent=2),encoding='utf-8')
