from conftest import make,post
from backend.db import db,get,put

def test_roulette_and_auto_board(env,monkeypatch):
    monkeypatch.setattr('backend.jam.AUTO_REVEAL',True)
    c,admin,r,root,ps=make(env,2);j=root+'/jam'
    assert c.post('/api'+j+'/control',headers=ps[0][1],json={'action':'roulette'}).status_code==403
    spin=post(c,j+'/control',{'action':'roulette'},admin)
    assert spin['drawer'] in [p['id'] for p,h in ps]
    assert c.post('/api'+j+'/draw',headers=admin,json={}).status_code==409
    with db() as conn:
        s=get(conn,'jam-'+r['id'],'jam');s['roulette_until']=0;put(conn,r['id'],'jam',s)
    card=post(c,j+'/draw',{},admin)['card']
    post(c,j+'/activity',{'card':card},ps[0][1])
    view=c.get('/api'+j,headers=ps[1][1]).json()
    assert len(view['participants'])==2 and view['typing']==1 and view['board']==[] and view['wall']==[]
    b={'card':card,'phase':'initial','answers':{'meaning':'private first thought'}}
    first=post(c,j+'/response',b,ps[0][1])
    view=c.get('/api'+j,headers=ps[1][1]).json()
    assert view['submitted']==1 and view['board']==[]
    post(c,j+'/response',b,ps[1][1])
    view=c.get('/api'+j,headers=ps[0][1]).json()
    assert view['phase']=='discussion' and len(view['board'][0]['responses'])==2
    assert all(p['status']=='submitted' for p in view['participants'])
    assert post(c,j+'/response',b,ps[0][1])['id']==first['id']
    post(c,j+'/control',{'action':'arm','drawer':ps[0][0]['id']},admin)
    newcard=post(c,j+'/draw',{},admin)['card']
    assert newcard!=card
    view=c.get('/api'+j,headers=ps[0][1]).json()
    assert len(view['board'])==1 and view['wall']==[]

def test_presence_expiry_late_join_and_analysis_privacy(env,monkeypatch):
    monkeypatch.setattr('backend.jam.AUTO_REVEAL',True)
    c,admin,r,root,ps=make(env,1);j=root+'/jam'
    post(c,j+'/control',{'action':'arm','drawer':ps[0][0]['id']},admin)
    card=post(c,j+'/draw',{},admin)['card']
    late=post(c,root+'/join',{'group':'VCU','classroom':True},{})
    lateh={'Authorization':'Bearer '+late['token']}
    assert c.post('/api'+j+'/response',headers=lateh,json={'card':card,'answers':{}}).status_code==409
    with db() as conn:put(conn,r['id'],'jam_presence',dict(id='presence-'+r['id']+'-'+ps[0][0]['id'],card=card,typing_at=0))
    assert c.get('/api'+j,headers=lateh).json()['typing']==0
    response=post(c,j+'/response',{'card':card,'answers':{'meaning':'hello'}},ps[0][1])
    assert c.get('/api'+j,headers=lateh).json()['phase']=='discussion'
    with db() as conn:
        put(conn,'*','archive_run',dict(status='complete',field='meaning',phase='initial',inputs=[dict(id=response['id'],room=r['id'],card=card,pid='P01',text='hello'),dict(id='foreign',room='OTHER',card=card,pid='P99',text='SECRET')],pairs=[dict(left=response['id'],right='foreign',score=.9)]))
    view=c.get('/api'+j,headers=lateh).json()
    assert view['analyses']==[] and 'SECRET' not in str(view)
