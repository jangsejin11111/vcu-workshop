import json
from scripts.analyze_export import collect

def test_exports_keep_latest_and_separate_fields(tmp_path):
    def data(version, text):
        return {'duo':[{'code':'1031a'}], 'duo_round':[{'id':'r','number':1,'status':'closed','scene':['context','context','말','line']}],
            'duo_edit':[{'id':str(version),'round':'r','participant':'p','pid':'K01','group':'KR','version':version,'answers':{'meaning':text,'action':'act'}}]}
    a,b=tmp_path/'a.json',tmp_path/'b.json'
    a.write_text(json.dumps(data(1,'old')));b.write_text(json.dumps(data(2,'new')))
    result=collect([b,a],'meaning')
    assert len(result)==1 and result[0]['text']=='new'
    assert collect([a,b],'action')[0]['text']=='act'
