import copy
import importlib.util
import json
from datetime import date
from pathlib import Path
import unittest

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

if __name__=='__main__':unittest.main()
