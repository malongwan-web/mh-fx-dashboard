"""Read BNK's public web form (no FX API or API subscription). Python stdlib only."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import ssl
import sys
import time
from datetime import date, datetime, timedelta
from decimal import Decimal
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

SOURCE = 'https://www.busanbank.co.kr/ib20/mnu/CMNCMN006001000'
FORM = 'https://www.busanbank.co.kr/ib20/wgt/QSVEXR650INQV1AM'
DB = 'https://enxjivecjezqlytewala.supabase.co'
PUBLIC_KEY = 'sb_publishable_Gb4_Gwwrjy8eYr0vC1ZTpQ_5wud4pc0'
CURRENCIES = ('USD', 'JPY', 'EUR', 'CNY')

class NoRate(ValueError):
    pass

def parse_page(page, target):
    if page.lstrip().startswith('{'):
        response = json.loads(page)
        common = response.get('_msg_', {}).get('_common_', {})
        if common.get('error.addition.code') == 'BAFEB06531':
            raise NoRate('Bank confirms public holiday; no announcement')
        raise ValueError('Bank returned an error response')
    # Parse the inert JSON literal; never execute bank JavaScript.
    match = re.search(r"var\s+resultData\s*=\s*JSON\.parse\('([^\n]*?)'\)", page)
    if not match:
        raise ValueError('Bank page format changed: rate JSON missing')
    records = json.loads(match.group(1))['FRX12FIE01310108V00_REC1']
    if not records:
        raise NoRate('No rates announced for requested date')
    selected = [r for r in records if r.get('CURCD1') in CURRENCIES]
    if len(selected) != 4 or {r['CURCD1'] for r in selected} != set(CURRENCIES):
        raise ValueError('Four unique currencies required')
    output = []
    for row in selected:
        if row['NTFC_DT'] != target.strftime('%Y%m%d') or row['NTFC_TMRD'] != '1':
            raise ValueError('Announcement date or round mismatch; refusing stale/final rates')
        currency = row['CURCD1']
        if currency == 'JPY' and '(100)' not in row['CURCD1_FMT']:
            raise ValueError('JPY 100 unit missing')
        rate = Decimal(row['BYS_CRRT_FMT'].replace(',', ''))
        if not rate.is_finite() or rate <= 0 or rate != Decimal(row['BYS_CRRT']) / 100:
            raise ValueError('Raw and displayed base rates disagree')
        announced = datetime.strptime(row['NTFC_DT'] + row['NTFC_TM'], '%Y%m%d%H%M%S').replace(tzinfo=ZoneInfo('Asia/Seoul'))
        output.append(dict(rate_date=target.isoformat(), currency=currency, unit=100 if currency == 'JPY' else 1,
                           base_rate=str(rate), round_no=1, announced_at=announced.isoformat()))
    return output

def fetch_rates(target):
    body = urlencode(dict(action_type='wgt', ib20_action='/ib20/wgt/QSVEXR650INQV1AM',
                          ib20_cur_mnu='CMNCMN006001000', ib20_cur_wgt='QSVEXR650INQV1AM',
                          inqCrdt=target.strftime('%Y%m%d'), ntfcTmrd='1')).encode()
    request = Request(FORM, data=body, headers={'User-Agent':'MH-FX-Collector/1.0', 'Referer':SOURCE,
                                              'Content-Type':'application/x-www-form-urlencoded'})
    for attempt in range(3):
        try:
            # Fresh context for each attempt; keep certificate/hostname checks on.
            with urlopen(request, timeout=40, context=ssl.create_default_context()) as response:
                if response.status != 200:
                    raise ValueError('Bank HTTP error')
                raw = response.read()
            break
        except (URLError, TimeoutError):
            error = sys.exc_info()[1]
            if isinstance(error, HTTPError) and error.code != 429 and error.code < 500:
                raise
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    page = raw.decode('utf-8')
    return parse_page(page, target), hashlib.sha256(raw).hexdigest()

def rpc(token, target, rows, digest, result='success', details=''):
    payload = json.dumps(dict(p_token=token, p_date=target.isoformat(), p_rows=rows,
                              p_sha256=digest, p_result=result, p_details=details)).encode()
    request = Request(DB+'/rest/v1/rpc/collect_fx_first', data=payload,
                      headers={'apikey':PUBLIC_KEY, 'Content-Type':'application/json'})
    with urlopen(request, timeout=30) as response:
        return json.load(response)

def collect(days=7, end=None, dry_run=False, evidence_dir=None):
    end = end or datetime.now(ZoneInfo('Asia/Seoul')).date()
    token = os.environ.get('FX_COLLECTOR_TOKEN', '')
    if not dry_run and not token:
        raise RuntimeError('FX_COLLECTOR_TOKEN is required')
    results, failures = [], []
    for offset in range(days-1, -1, -1):
        target = end-timedelta(days=offset)
        if target.weekday() >= 5:
            continue
        try:
            rows, digest = fetch_rates(target)
            response = {'status':'dry_run'} if dry_run else rpc(token,target,rows,digest)
            item = dict(date=target.isoformat(), source_url=SOURCE, sha256=digest, rows=rows, database=response)
            results.append(item)
            print(json.dumps(item, ensure_ascii=False))
        except NoRate:
            if not dry_run:
                rpc(token,target,[],None,'skipped','No rates announced for requested date')
            print(json.dumps({'date':target.isoformat(),'status':'no_announcement'}))
        except Exception as exc:
            # Do not log request payloads or credentials.
            message = type(exc).__name__ + ': ' + str(exc)[:180]
            failures.append({'date':target.isoformat(),'error':message})
            print(json.dumps(failures[-1]), file=sys.stderr)
            if not dry_run:
                try:
                    rpc(token,target,[],None,'failed',message)
                except Exception:
                    pass
        time.sleep(1)
    if evidence_dir:
        out = Path(evidence_dir)
        out.mkdir(parents=True,exist_ok=True)
        (out/'collection.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    if failures:
        raise RuntimeError(f'{len(failures)} collection failures; see dates above')
    return results

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--days',type=int,default=7)
    parser.add_argument('--end',type=date.fromisoformat)
    parser.add_argument('--dry-run',action='store_true')
    parser.add_argument('--evidence-dir')
    args = parser.parse_args()
    if not 1 <= args.days <= 366:
        parser.error('--days must be 1..366')
    collect(args.days,args.end,args.dry_run,args.evidence_dir)
