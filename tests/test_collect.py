import copy
import importlib.util
import json
from datetime import date
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError
import ssl

spec=importlib.util.spec_from_file_location('collect',Path(__file__).parents[1]/'scripts/collect.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

def fixture(rows):
    return "var resultData = JSON.parse('"+json.dumps({'FRX12FIE01310108V00_REC1':rows})+"');"

class CollectorTest(unittest.TestCase):
    def setUp(self):
        self.rows=[dict(CURCD1=k,CURCD1_FMT='JPY(100)' if k=='JPY' else k,NTFC_DT='20261014',NTFC_TMRD='1',NTFC_TM='082920',BYS_CRRT_FMT=v,BYS_CRRT=str(int(float(v.replace(',',''))*100))) for k,v in zip(c.CURRENCIES,['1,340.50','846.57','1,500.96','200.23'])]
    def test_base_rate_unit_and_cross(self):
        rows=c.parse_page(fixture(self.rows),date(2026,10,14));self.assertEqual(rows[1]['unit'],100);self.assertEqual(rows[0]['base_rate'],'1340.50');self.assertEqual(round(float(rows[0]['base_rate'])/float(rows[1]['base_rate'])*100,2),158.34)
    def test_stale_or_final_rejected(self):
        for key,value in [('NTFC_DT','20261013'),('NTFC_TMRD','999')]:
            rows=copy.deepcopy(self.rows);rows[0][key]=value
            with self.assertRaises(ValueError):c.parse_page(fixture(rows),date(2026,10,14))
    def test_missing_duplicate_unit_and_raw_mismatch(self):
        cases=[self.rows[:-1],self.rows+[self.rows[0]]]
        rows=copy.deepcopy(self.rows);rows[1]['CURCD1_FMT']='JPY';cases.append(rows)
        rows=copy.deepcopy(self.rows);rows[0]['BYS_CRRT']='1';cases.append(rows)
        for rows in cases:
            with self.assertRaises(ValueError):c.parse_page(fixture(rows),date(2026,10,14))
    def test_empty_and_changed_format(self):
        with self.assertRaises(c.NoRate):c.parse_page(fixture([]),date(2026,10,14))
        with self.assertRaises(ValueError):c.parse_page('maintenance',date(2026,10,14))
    def test_explicit_holiday_only(self):
        with self.assertRaises(c.NoRate):c.parse_page(json.dumps({'_msg_':{'_common_':{'error.addition.code':'BAFEB06531'}}}),date(2026,10,9))
        with self.assertRaises(ValueError):c.parse_page(json.dumps({'_msg_':{'_common_':{'error.addition.code':'OTHER'}}}),date(2026,10,9))
    def test_transient_connection_retry_keeps_tls_verification(self):
        response=MagicMock();response.__enter__.return_value=response;response.status=200;response.read.return_value=fixture(self.rows).encode()
        with patch.object(c,'urlopen',side_effect=[URLError('transient TLS error'),response]) as open_mock, patch.object(c.time,'sleep'):
            rows,_=c.fetch_rates(date(2026,10,14))
            self.assertEqual(len(rows),4);self.assertEqual(open_mock.call_count,2)
            for call in open_mock.call_args_list:
                self.assertEqual(call.kwargs['context'].verify_mode,ssl.CERT_REQUIRED)
                self.assertTrue(call.kwargs['context'].check_hostname)
    def test_not_found_is_not_retried(self):
        with patch.object(c,'urlopen',side_effect=HTTPError(c.FORM,404,'Not Found',{},None)) as open_mock, patch.object(c.time,'sleep'):
            with self.assertRaises(HTTPError):c.fetch_rates(date(2026,10,14))
            self.assertEqual(open_mock.call_count,1)

if __name__=='__main__':unittest.main()
