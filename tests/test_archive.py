from conftest import make,post,collect
from backend.db import db,get,put

def test_archive_privacy_and_removed_routes(env,monkeypatch):
    c,admin,r,root,ps=collect(env,monkeypatch)
    for h in [{},ps[0][1]]: assert c.get('/api/archive',headers=h).status_code in [401,403]
    assert c.get('/api/archive/rooms/'+r['id'],headers=admin).json()['responses']==[]
    assert c.post('/api/archive/analyze',json={'rooms':[r['id']],'field':'meaning','phase':'initial'},headers=admin).status_code==422
    for path in ['/responses','/control','/dialogues','/jam/analyze']:
        assert c.post('/api'+root+path,json={},headers=admin).status_code==405
    post(c,root+'/jam/control',{'action':'reveal','reason':'done'},admin)
    assert len(c.get('/api/archive/rooms/'+r['id'],headers=admin).json()['responses'])==2
    post(c,root+'/jam/control',{'action':'arm','drawer':ps[0][0]['id']},admin)
    with monkeypatch.context() as m:
        m.setattr('secrets.choice',lambda xs:xs[0])
        post(c,root+'/jam/draw',{},admin)
    post(c,root+'/jam/response',{'card':1,'answers':{'meaning':'PRIVATE'}},ps[0][1])
    detail=c.get('/api/archive/rooms/'+r['id'],headers=admin).json()
    assert len(detail['responses'])==2 and detail['cards']==[0]

def test_analysis_snapshots_phases_and_failure(env,monkeypatch):
    import numpy as np
    c,admin,r,root,ps=collect(env,monkeypatch)
    post(c,root+'/jam/control',{'action':'reveal','reason':'done'},admin)
    seen=[]
    def encode(texts):
        seen.append(texts);return np.eye(len(texts)),[8]*len(texts)
    monkeypatch.setattr('backend.model.encode',encode)
    first=post(c,'/archive/analyze',{'rooms':[r['id']],'field':'action','phase':'initial'},admin)
    run=c.get('/api/archive/runs/'+first['id'],headers=admin).json()
    assert run['status']=='complete' and seen==[['action 0','action 1']]
    pair=run['pairs'][0]
    post(c,'/archive/runs/'+run['id']+'/review',{**pair,'decision':'different','reason':'different intention'},admin)
    for i,(p,h) in enumerate(ps):
        for v in ['old','latest']: post(c,root+'/jam/response',{'card':0,'answers':{'action':v+str(i)}},h)
    second=post(c,'/archive/analyze',{'rooms':[r['id']],'field':'action','phase':'discussion'},admin)
    assert seen[-1]==['latest0','latest1']
    assert c.get('/api/archive/runs/'+first['id'],headers=admin).json()['inputs']==run['inputs']
    assert len(c.get('/api/archive/rooms/'+r['id'],headers=admin).json()['responses'])==6
    def fail(_): raise RuntimeError('offline')
    monkeypatch.setattr('backend.model.encode',fail)
    third=post(c,'/archive/analyze',{'rooms':[r['id']],'field':'meaning','phase':'initial'},admin)
    failed=c.get('/api/archive/runs/'+third['id'],headers=admin).json()
    assert failed['status']=='failed' and failed['pairs']==[]

def test_archive_export_and_restart(env,monkeypatch):
    from fastapi.testclient import TestClient
    from backend.app import app
    c,admin,r,root,ps=collect(env,monkeypatch)
    post(c,root+'/jam/control',{'action':'reveal','reason':'done'},admin)
    post(c,root+'/jam/note',{'card':0,'text':'=formula'},ps[0][1])
    post(c,root+'/jam/control',{'action':'finish'},admin)
    with db() as conn:
        put(conn,'*','archive_run',dict(id='interrupted',status='running',rooms=[r['id']],inputs=[],pairs=[]))
    with TestClient(app) as restart:
        assert restart.get('/api/archive/runs/interrupted',headers=admin).json()['status']=='failed'
        data=restart.get('/api/archive/rooms/'+r['id']+'/export',headers=admin).json()
        assert len(data['responses'])==2 and len(data['notes'])==1
        csv=restart.get('/api/archive/rooms/'+r['id']+'/export?format=csv',headers=admin).content
        assert csv.startswith(b'\xef\xbb\xbf') and b"'=formula" in csv
        assert restart.post('/api'+root+'/join',json={'group':'Kart','classroom':True}).status_code==409

def test_multiple_rooms_never_mix_scenes(env,monkeypatch):
    import numpy as np
    c,admin,r,root,ps=collect(env,monkeypatch)
    post(c,root+'/jam/control',{'action':'reveal','reason':'done'},admin)
    c,admin,r2,root2,ps2=collect(env,monkeypatch)
    post(c,root2+'/jam/control',{'action':'reveal','reason':'done'},admin)
    # Change one stored scene snapshot; it must not be compared with the others.
    with db() as conn:
        from backend.db import rows
        other=rows(conn,r2['id'],'jam_response')[0]
        other['scene']=['a genuinely different scene']
        put(conn,r2['id'],'jam_response',other)
    seen=[]
    def encode(texts):
        seen.append(texts);return np.eye(len(texts)),[3]*len(texts)
    monkeypatch.setattr('backend.model.encode',encode)
    result=post(c,'/archive/analyze',{'rooms':[r['id'],r2['id']],'field':'meaning','phase':'initial'},admin)
    run=c.get('/api/archive/runs/'+result['id'],headers=admin).json()
    assert len(seen)==1 and len(seen[0])==3
    assert len(run['inputs'])==4 and len(run['pairs'])==3
