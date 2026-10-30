import pytest
from fastapi.testclient import TestClient
from backend.app import app

@pytest.fixture
def env(tmp_path,monkeypatch):
    monkeypatch.setattr('backend.jam.AUTO_REVEAL',False)
    monkeypatch.setenv('VCU_DATA',str(tmp_path))
    monkeypatch.setenv('VCU_ADMIN_PASSWORD','test-password-very-long')
    c=TestClient(app)
    token=c.post('/api/login',json={'password':'test-password-very-long'}).json()['token']
    return c,{'Authorization':'Bearer '+token}

def post(c,path,body,h):
    r=c.post('/api'+path,json=body,headers=h)
    assert r.status_code==200,r.text
    return r.json()

def make(env,n=2,consent=True):
    c,admin=env;r=post(c,'/rooms',{'consent_required':consent},admin);root='/rooms/'+r['id'];ps=[]
    for i in range(n):
        p=post(c,root+'/join',{'group':'Kart' if i%2==0 else 'VCU','classroom':True},{})
        h={'Authorization':'Bearer '+p['token']};me=c.get('/api'+root+'/me',headers=h).json();ps.append((me,h))
    return c,admin,r,root,ps

def collect(env,monkeypatch,card=0):
    c,admin,r,root,ps=make(env)
    post(c,root+'/jam/control',{'action':'arm','drawer':ps[0][0]['id']},admin)
    with monkeypatch.context() as m:
        m.setattr('secrets.choice',lambda xs:xs[0])
        post(c,root+'/jam/draw',{},admin)
    for i,(p,h) in enumerate(ps):
        post(c,root+'/jam/response',{'card':0,'answers':{'meaning':'meaning '+str(i),'action':'action '+str(i),'emotion':'emotion '+str(i)}},h)
    return c,admin,r,root,ps
