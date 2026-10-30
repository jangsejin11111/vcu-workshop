"""Day-one jam. Original responses, discussion revisions and suggestions stay separate."""
from fastapi import APIRouter, Header
from .db import db, rows, get, put, uid, now
from . import model
import time, secrets
AUTO_REVEAL = True

DECK = [
 ('늦은 밤, 작업실 정리가 남았다. 팀원이 말한다.', 'Late at night, the studio still needs cleaning. A teammate says:', '먼저 가도 돼.', 'You can go ahead.'),
 ('학교에서 아는 사람을 마주쳤다.', 'You run into an acquaintance on campus.', '언제 밥 한번 먹자.', "Let’s grab a meal sometime."),
 ('처음 만난 교수님이 말한다.', 'A professor you just met says:', '앞으로 편하게 대해요.', 'Feel free to be casual with me.'),
 ('크리틱에서 동기가 내 작업을 보고 말한다.', 'At a critique, a classmate looks at your work:', '와, 진짜 독특하다.', "Wow, that’s really unique."),
 ('도와주겠다고 했더니 친구가 말한다.', 'You offer to help a friend. They say:', '괜찮아, 내가 할게.', "It’s fine, I’ll just do it."),
 ('친구 부모님께 선물을 드렸다.', "You bring a gift to a friend’s parent.", '이런 걸 왜 사 왔어, 다음부턴 이러지 마.', "Why did you buy this? Don’t do this next time."),
 ('팀플 회의 시간을 정하는데 한 명이 말한다.', 'A team is picking a time to meet. One person says:', '다들 괜찮으면 나도 괜찮아.', "If everyone’s okay with it, I’m okay."),
 ('선생님이 말한다.', 'A teacher says:', '궁금한 거 있으면 전화해.', 'Call me if you have questions.'),
]
SOURCE = 'https://docs.google.com/document/d/1nxTmoumwYu6xC5EWsTJZ1-4eLp1wckkZTJC2uur2Hm0/edit?tab=t.1soy662tqsve'

def install(app, auth, check, roomget):
    router = APIRouter(prefix='/api/rooms/{code}/jam')
    def current(c, code):
        roomget(c, code)
        return get(c, 'jam-'+code, 'jam') or dict(id='jam-'+code, phase='lobby', card=None, drawn=[], drawer=None, target=3)
    def valid(c, code, authorization, roles=None):
        check(roomget(c,code).get("tool")!="duo", "Use workshop endpoints",409)
        return auth(c, authorization, code, roles)
    @router.get('')
    def state(code: str, authorization: str | None = Header(None)):
        with db() as c:
            a=valid(c,code,authorization)
            s=current(c,code)
            ps=rows(c,code,'participant')
            rs=[r for r in rows(c,code,'jam_response') if r['card']==s['card']]
            initial=[r for r in rs if r['phase']=='initial']
            submitted={r['participant'] for r in initial}
            mine=[r for r in rs if r['participant']==a.get('participant')]
            card=None if s['card'] is None else DECK[s['card']]
            roster=[]
            for p in ps:
                activity=get(c,'presence-'+code+'-'+p['id'],'jam_presence') or {}
                active=time.time()-activity.get('typing_at',0)<8 and activity.get('card')==s['card'] and s['phase']=='answer'
                roster.append(dict(id=p['id'],pid=p['pid'],status='submitted' if p['id'] in submitted else 'typing' if active else 'waiting',eligible=p['id'] in s.get('expected',[x['id'] for x in ps])))
            from .archive import bundle
            saved=bundle(c,code)
            board=[]
            for index,n in enumerate([n for n in s['drawn'] if n in saved['cards']]):
                answers=[r for r in saved['responses'] if r['card']==n]
                board.append(dict(card=n,round=index+1,scene=answers[0].get('scene',DECK[n]) if answers else DECK[n],responses=answers,notes=[r for r in saved['notes'] if r['card']==n]))
            public_runs=[]
            for r in rows(c,'*','archive_run'):
                local={x['id']:x for x in r['inputs'] if x['room']==code and x['card'] in saved['cards']}
                pairs=[{**p,'left_text':local[p['left']]['text'],'right_text':local[p['right']]['text'],'left_pid':local[p['left']]['pid'],'right_pid':local[p['right']]['pid'],'card':local[p['left']]['card']} for p in r.get('pairs',[]) if p['left'] in local and p['right'] in local]
                if pairs: public_runs.append(dict(id=r['id'],field=r['field'],phase=r['phase'],created_at=r['created_at'],pairs=pairs))
            return {**s,'card_data':card,'role':a['role'],'participant':a.get('participant'),'participants':roster,'total':len(s.get('expected',ps)),'joined':len(ps),'submitted':len(submitted),'typing':sum(p['status']=='typing' for p in roster),'mine':mine,'draft':get(c,f"jd-{code}-{a.get('participant')}-{s['card']}",'jam_draft'),'wall':rs if s['phase'] in ['discussion','done'] else [],'notes':[n for n in saved['notes'] if n['card']==s['card']],'board':board,'analyses':public_runs}
    @router.post('/activity')
    def activity(code: str, body:dict, authorization:str|None=Header(None)):
        with db() as c:
            a=valid(c,code,authorization,['participant']);s=current(c,code)
            check(s['phase']=='answer' and body.get('card')==s['card'],'Round changed',409)
            put(c,code,'jam_presence',dict(id='presence-'+code+'-'+a['participant'],card=s['card'],typing_at=time.time()))
            return {'ok':True}
    @router.post('/control')
    def control(code: str, body: dict, authorization: str | None = Header(None)):
        with db() as c:
            valid(c,code,authorization,['admin'])
            s=current(c,code); action=body.get('action')
            if action in ['arm','roulette']:
                check(s['phase'] in ['lobby','discussion'], 'Finish the current round first',409)
                check(len(s['drawn'])<8,'All cards used',409)
                people=rows(c,code,'participant')
                check(people,'No participants yet',409)
                p=secrets.choice(people) if action=='roulette' else get(c,body.get('drawer',''),'participant')
                check(p and any(x['id']==p['id'] for x in rows(c,code,'participant')), 'Choose a participant',422)
                s.update(phase='draw',drawer=p['id'],roulette_started=time.time(),roulette_until=time.time()+(3.2 if action=='roulette' else 0),roulette_ids=[x['id'] for x in people])
            elif action=='reveal':
                check(s['phase']=='answer','Not collecting',409)
                check(str(body.get('reason','')).strip(),'Record closure reason',422)
                s.update(phase='discussion',closure_reason=body['reason'])
                s['revealed']=list(dict.fromkeys(s.get('revealed',[])+s['drawn']))
            elif action=='finish':
                check(s['phase']=='discussion','Reveal responses first',409); s.update(phase='done',finished_at=now())
            else: check(False,'Unknown action',422)
            put(c,code,'jam_event',dict(state=s.copy()))
            return put(c,code,'jam',s)
    @router.post('/draw')
    def draw(code: str, body: dict, authorization: str | None = Header(None)):
        import secrets
        with db() as c:
            a=valid(c,code,authorization,['participant','admin']); s=current(c,code)
            check(s['phase']=='draw','Not drawing',409)
            check(time.time()>=s.get('roulette_until',0),'Roulette still running',409)
            check(a['role']=='admin' or a.get('participant')==s['drawer'],'Wait for your turn')
            card=secrets.choice([i for i in range(8) if i not in s['drawn']])
            s.update(card=card,drawn=s['drawn']+[card],phase='answer',drawn_at=time.time(),expected=[p['id'] for p in rows(c,code,'participant')])
            put(c,code,'jam_event',dict(state=s.copy()))
            return put(c,code,'jam',s)
    @router.post('/response')
    def response(code: str, body: dict, authorization: str | None = Header(None)):
        with db() as c:
            a=valid(c,code,authorization,['participant']); s=current(c,code)
            phase=body.get('phase') or ('initial' if s['phase']=='answer' else 'discussion')
            check(phase in ['initial','discussion'],'Invalid response phase',422)
            if phase=='initial' and not body.get('draft') and body.get('card')==s['card']:
                previous=[r for r in rows(c,code,'jam_response') if r['participant']==a['participant'] and r['card']==body.get('card') and r['phase']=='initial']
                if previous: return previous[0]
            check((phase=='initial' and s['phase']=='answer') or (phase=='discussion' and s['phase']=='discussion'),'Response phase closed',409)
            check(s['phase'] in ['answer','discussion'] and body.get('card')==s['card'],'Round changed',409)
            answers=body.get('answers',{})
            check(isinstance(answers,dict),'Invalid answers',422)
            allowed=['meaning','choice','certainty','reply','action','familiarity','emotion']
            check(set(answers)<=set(allowed),'Unknown answer',422)
            for k,v in answers.items():
                check(isinstance(v,str) and len(v)<=3000,'Answer too long',422)
                if k in ['certainty','familiarity']: check(v in ['','1','2','3','4','5'],'Invalid rating',422)
                if k=='choice': check(v in ['','literal','other','both','unsure'],'Invalid choice',422)
            pid=a['participant']
            check(pid in s.get('expected',[pid]), 'Join this activity next round',409)
            check(get(c,pid,'participant')['consent']['classroom'], 'Classroom consent required',403)
            if body.get('draft'):
                check(phase=='initial','Draft closed',409)
                return put(c,code,'jam_draft',dict(id=f'jd-{code}-{pid}-{s["card"]}',participant=pid,answers=answers))
            existing=[r for r in rows(c,code,'jam_response') if r['participant']==pid and r['card']==s['card'] and r['phase']==phase]
            if phase=='initial' and existing: return existing[0]
            p=get(c,pid,'participant')
            result=put(c,code,'jam_response',dict(participant=pid,pid=p['pid'],group=p['group'],card=s['card'],phase=phase,answers=answers,language=body.get('language','ko'),scene=DECK[s['card']],source=SOURCE))
            submitted={r['participant'] for r in rows(c,code,'jam_response') if r['card']==s['card'] and r['phase']=='initial'}
            expected=set(s.get('expected',[p['id'] for p in rows(c,code,'participant')]))
            if AUTO_REVEAL and phase=='initial' and expected and expected<=submitted:
                s.update(phase='discussion',closure_reason='All round participants submitted',revealed=list(dict.fromkeys(s.get('revealed',[])+s['drawn'])))
                put(c,code,'jam',s)
                put(c,code,'jam_event',dict(state=s.copy()))
            return result
    @router.post('/note')
    def note(code: str, body: dict, authorization: str | None = Header(None)):
        with db() as c:
            a=valid(c,code,authorization,['participant','admin']); s=current(c,code)
            check(s['phase']=='discussion' and body.get('card')==s['card'],'Discussion closed',409)
            value=str(body.get('text','')).strip(); check(0<len(value)<=4000,'Write a short note',422)
            p=get(c,a.get('participant',''),'participant')
            return put(c,code,'jam_note',dict(card=s['card'],actor=a.get('participant',a['id']),group=p['group'] if p else 'Facilitator',text=value))
    @router.get('/export')
    def export(code: str, authorization: str | None = Header(None)):
        with db() as c:
            valid(c,code,authorization,['admin'])
            check(current(c,code)['phase'] in ['discussion','done'], 'Close collection before exporting',409)
            return {'source':SOURCE,'deck':DECK, **{k:rows(c,code,k) for k in ['jam','jam_response','jam_note','jam_analysis','jam_event']}}
    app.include_router(router)
