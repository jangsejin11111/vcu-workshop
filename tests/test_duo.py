from conftest import post
from backend.db import db,get,put,rows

def setup(env):
 c,admin=env;r=post(c,'/workshops',{'name':'test'},admin);code=r['id'];root='/workshops/'+code;users={}
 for group in ['KR','US']:
  x=post(c,root+'/join',{'group':group,'consent':True},{})
  users[group]={'Authorization':'Bearer '+x['token']}
 post(c,root+'/control',{'action':'draw','minutes':5,'card':0},admin)
 s=c.get('/api'+root,headers=admin).json()
 return c,admin,code,root,users,s['round']

def test_duo_live_visibility_timer_and_conflicts(env):
 c,admin,code,root,users,rid=setup(env)
 b={'round':rid,'base_version':0,'answers':{'meaning':'Korean group thought','reply':'hello','action':'stay'}}
 saved=post(c,root+'/edit',b,users['KR'])
 assert c.post('/api'+root+'/edit',json=b,headers=users['KR']).status_code==409
 us=c.get('/api'+root,headers=users['US']).json();kr=c.get('/api'+root,headers=users['KR']).json();all=c.get('/api'+root,headers=admin).json()
 assert us['edits']==[] and kr['edits'][0]['answers']['meaning']==b['answers']['meaning']
 assert len(all['participants'])==2 and kr['round']==us['round']
 assert c.get('/api/rooms/'+code+'/jam',headers=users['US']).status_code==409
 assert c.post('/api/rooms/'+code+'/join',json={'group':'KR','classroom':True}).status_code==409
 with db() as conn:
  r=get(conn,rid,'duo_round');r['ends_at']=0;put(conn,code,'duo_round',r)
 assert c.get('/api'+root,headers=users['KR']).json()['phase']=='round_closed'
 assert c.post('/api'+root+'/edit',json={**b,'base_version':1},headers=users['KR']).status_code==409
 with db() as conn:
  assert len(rows(conn,code,'duo_edit'))==1
  snap=rows(conn,code,'jam_response')[0];assert snap['collaborative'] and snap['phase']=='discussion'
 assert len(c.get('/api/archive/rooms/'+code,headers=admin).json()['responses'])==1

def prepare(env):
 c,admin,code,root,users,rid=setup(env)
 for g in users:
  post(c,root+'/conclusion',{'round':rid,'base_version':0,'original':g+' original','english':g+' observations'},users[g])
 post(c,root+'/control',{'action':'prepare'},admin)
 assert c.post('/api'+root+'/personas',json={},headers=admin).status_code==409
 for g in users:
  post(c,root+'/conclusion',{'round':rid,'group':g,'base_version':1,'original':g+' original','english':g+' observations','approved':True},admin)
 v=post(c,root+'/personas',{},admin)
 return c,admin,code,root,users,rid,v

def test_personas_real_call_contract_no_fallback_and_history(env,monkeypatch):
 c,admin,code,root,users,rid,v=prepare(env)
 assert 'KR observations' in v['prompts']['KR'] and 'US observations' not in v['prompts']['KR']
 assert v['prompts']['KR'].replace('KR observations','notes')==v['prompts']['US'].replace('US observations','notes')
 monkeypatch.delenv('OPENAI_API_KEY',raising=False)
 assert c.post('/api'+root+'/chat',json={'question':"I'm fine.",'request_id':'no-key'},headers=admin).status_code==503
 assert c.post('/api'+root+'/chat',json={'question':'hello','request_id':'participant'},headers=users['KR']).status_code==403
 monkeypatch.setenv('OPENAI_API_KEY','sk-test-not-real')
 calls=[]
 async def fake(prompt,question,on_delta,model_name=None):
  calls.append((prompt,question,model_name));await on_delta('test stream');return {'text':'TEST ONLY','model':model_name,'response_id':'test','usage':{}}
 monkeypatch.setattr('backend.llm.generate',fake)
 run=post(c,root+'/chat',{'question':"I'm fine.",'request_id':'once'},admin)
 assert len(calls)==2 and calls[0][1:]==calls[1][1:]
 assert post(c,root+'/chat',{'question':"I'm fine.",'request_id':'once'},admin)['id']==run['id'] and len(calls)==2
 state=c.get('/api'+root,headers=users['KR']).json();assert state['chats'][0]['status']=='complete' and 'prompts' not in state['chats'][0]
 post(c,root+'/control',{'action':'prepare'},admin)
 post(c,root+'/conclusion',{'round':rid,'group':'KR','base_version':2,'original':'new','english':'new english','approved':True},admin)
 v2=post(c,root+'/personas',{},admin);assert v2['version']==2
 export=c.get('/api'+root+'/export',headers=admin).json()
 assert len(export['duo_persona'])==2 and export['duo_chat'][0]['prompts']==v['prompts']
 async def fail(*args):raise RuntimeError('Service unavailable')
 monkeypatch.setattr('backend.llm.generate',fail)
 post(c,root+'/chat',{'question':'again','request_id':'failed'},admin)
 failed=c.get('/api'+root,headers=admin).json()['chats'][-1]
 assert failed['status']=='failed' and all(a['text']=='' for a in failed['answers'].values())

def test_conclusion_group_binding_and_screen_readonly(env):
 c,admin,code,root,users,rid=setup(env)
 n=post(c,root+'/conclusion',{'round':rid,'group':'US','base_version':0,'original':'ours','english':'ours'},users['KR'])
 assert n['group']=='KR' and not n['approved']
 st=post(c,'/rooms/'+code+'/screen',{},admin);screen={'Authorization':'Bearer '+st['token']}
 assert c.get('/api'+root,headers=screen).status_code==200
 assert c.post('/api'+root+'/control',headers=screen,json={'action':'close'}).status_code==403
 post(c,root+'/control',{'action':'close'},admin)
 assert c.post('/api'+root+'/conclusion',headers=users['KR'],json={'round':rid,'base_version':1,'original':'too late'}).status_code==409

def test_five_question_answers_and_scale_validation(env):
 c,admin,code,root,users,rid=setup(env)
 answers={'choice':'both','meaning':'An indirect request','certainty':'4','reply':'Let me help','action':'Stay','familiarity':'2'}
 saved=post(c,root+'/edit',{'round':rid,'base_version':0,'answers':answers},users['KR'])
 assert saved['answers']==answers
 for field,value in [('choice','unknown'),('certainty','0'),('familiarity','6')]:
  assert c.post('/api'+root+'/edit',headers=users['KR'],json={'round':rid,'base_version':1,'answers':{**answers,field:value}}).status_code==422
 post(c,root+'/control',{'action':'close'},admin)
 exported=c.get('/api/archive/rooms/'+code+'/export',headers=admin).json()
 assert exported['responses'][0]['answers']==answers

def test_persona_individual_reference_isolated_latest_and_immutable(env):
 c,admin,code,root,users,rid=setup(env)
 post(c,root+'/edit',{'round':rid,'base_version':0,'answers':{'meaning':'OUTDATED'}},users['KR'])
 kr=post(c,root+'/edit',{'round':rid,'base_version':1,'answers':{'meaning':'KR_UNIQUE','choice':'both','certainty':'2','reply':'KR_REPLY','action':'KR_ACTION','familiarity':'4'}},users['KR'])
 us=post(c,root+'/edit',{'round':rid,'base_version':0,'answers':{'meaning':'US_UNIQUE'}},users['US'])
 post(c,root+'/control',{'action':'prepare'},admin)
 for g in users:
  post(c,root+'/conclusion',{'round':rid,'group':g,'base_version':0,'original':'original','english':g+' summary','approved':True},admin)
 v=post(c,root+'/personas',{},admin)
 assert len(v['individual_responses']['KR'])==1 and len(v['individual_responses']['US'])==1
 assert 'KR_UNIQUE' in v['prompts']['KR'] and 'US_UNIQUE' not in v['prompts']['KR']
 assert 'US_UNIQUE' in v['prompts']['US'] and 'KR_UNIQUE' not in v['prompts']['US']
 assert 'OUTDATED' not in v['prompts']['KR']
 assert kr['id'] not in v['prompts']['KR'] and kr['participant'] not in v['prompts']['KR']
 assert v['individual_responses']['KR'][0]['source_edit']==kr['id']
 assert 'KR_REPLY' in v['prompts']['KR'] and 'KR_ACTION' in v['prompts']['KR']
 post(c,root+'/control',{'action':'prepare'},admin)
 post(c,root+'/personas',{},admin)
 export=c.get('/api'+root+'/export',headers=admin).json()
 assert export['duo_persona'][0]['prompts']==v['prompts']
 assert len(export['duo_persona'])==2

def test_short_password_and_dated_versions(env,monkeypatch):
 from datetime import datetime,timezone,timedelta
 c,oldadmin=env
 monkeypatch.setenv('VCU_ADMIN_PASSWORD','5678')
 token=post(c,'/login',{'password':'5678'},{})['token'];admin={'Authorization':'Bearer '+token}
 assert c.get('/api/workshops',headers=oldadmin).status_code==401
 a=post(c,'/workshops',{},admin)['id'];b=post(c,'/workshops',{},admin)['id']
 prefix=datetime.now(timezone(timedelta(hours=9))).strftime('%m%d')
 assert a==prefix+'a' and b==prefix+'b'
 assert c.get('/api/workshops/'+a.upper(),headers=admin).status_code==200
 with db() as conn:put(conn,'*','room_alias',{'id':'alias-OLD123','target':a})
 assert c.get('/api/workshops/OLD123',headers=admin).json()['id']==a
