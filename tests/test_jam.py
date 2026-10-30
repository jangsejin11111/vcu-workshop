from conftest import make, post

def test_jam_round_privacy_and_history(env,monkeypatch):
    c,admin,r,root,ps=make(env,2)
    j=root+'/jam'
    assert c.get('/api'+j).status_code==401
    post(c,j+'/control',{'action':'arm','drawer':ps[0][0]['id']},admin)
    assert c.post('/api'+j+'/draw',json={},headers=ps[1][1]).status_code==403
    card=post(c,j+'/draw',{},ps[0][1])['card']
    b={'card':card,'answers':{'meaning':'They want help','reply':'I will help','action':'Stay','certainty':'3'}}
    first=post(c,j+'/response',b,ps[0][1])
    assert post(c,j+'/response',b,ps[0][1])['id']==first['id']
    post(c,j+'/response',{**b,'answers':{'meaning':'도와달라는 뜻'}},ps[1][1])
    for h in [admin,ps[0][1],ps[1][1]]:
        assert c.get('/api'+j,headers=h).json()['wall']==[]
    assert c.post('/api'+j+'/control',json={'action':'reveal','reason':'done'},headers=ps[0][1]).status_code==403
    post(c,j+'/control',{'action':'reveal','reason':'all submitted'},admin)
    assert len(c.get('/api'+j,headers=ps[0][1]).json()['wall'])==2
    post(c,j+'/response',{**b,'answers':{'meaning':'After discussion'}},ps[0][1])
    post(c,j+'/note',{'card':card,'text':'Keep exceptions'},ps[0][1])
    exported=c.get('/api'+j+'/export',headers=admin).json()
    assert len(exported['jam_response'])==3
    assert exported['jam_response'][0]['answers']['meaning']=='They want help'
    post(c,j+'/control',{'action':'arm','drawer':ps[1][0]['id']},admin)
    nextcard=post(c,j+'/draw',{},ps[1][1])['card']
    assert nextcard!=card
    assert c.post('/api'+j+'/response',json=b,headers=ps[0][1]).status_code==409
    assert c.get('/api'+j,headers=ps[0][1]).json()['wall']==[]

def test_jam_deck_and_consent(env):
    from backend.jam import DECK
    assert len(DECK)==8 and len(set(x[2] for x in DECK))==8
    c,admin,r,root,ps=make(env,1,False)
    p=post(c,root+'/join',{'group':'Other','classroom':False},{})
    h={'Authorization':'Bearer '+p['token']}
    post(c,root+'/jam/control',{'action':'arm','drawer':ps[0][0]['id']},admin)
    card=post(c,root+'/jam/draw',{},admin)['card']
    assert c.post('/api'+root+'/jam/response',json={'card':card,'answers':{'meaning':'private'}},headers=h).status_code==403
