"""Commit a deterministic public latest-rate receipt when a new fixing appears."""
import base64
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request,urlopen

REPO='malongwan-web/mh-fx-dashboard'
if os.environ.get('GITHUB_REPOSITORY') != REPO:
    raise RuntimeError('Unexpected repository')
records=json.loads(Path('evidence/run/collection.json').read_text(encoding='utf-8'))
if not records:
    print('No new rate receipt to publish')
    raise SystemExit(0)
latest=max(records,key=lambda x:x['date'])
receipt={'source_url':latest['source_url'],'rate_date':latest['date'],'round_no':1,'rates':latest['rows']}
content=(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n').encode()
endpoint='https://api.github.com/repos/'+REPO+'/contents/data/latest-first-rates.json'
headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'MH-FX-Collector'}
sha=None
try:
    with urlopen(Request(endpoint,headers=headers),timeout=30) as response:
        existing=json.load(response)
    old=base64.b64decode(existing['content'])
    if old==content:
        print('Latest public receipt unchanged; no commit')
        raise SystemExit(0)
    old_receipt=json.loads(old)
    if old_receipt['rate_date']>receipt['rate_date']:
        raise RuntimeError('Refusing to move receipt backwards')
    sha=existing['sha']
except HTTPError as error:
    if error.code!=404:
        raise
payload={'message':'Record BNK first-announcement rates for '+latest['date'],'content':base64.b64encode(content).decode(),'branch':'main'}
if sha:
    payload['sha']=sha
with urlopen(Request(endpoint,data=json.dumps(payload).encode(),headers=headers,method='PUT'),timeout=30) as response:
    result=json.load(response)
print('Public rate receipt commit: '+result['commit']['sha'])
