"""Authenticated archive and deferred analysis of immutable response snapshots."""
import json, hashlib, csv, io
from collections import defaultdict
from fastapi import APIRouter, Header, BackgroundTasks, Response
from .db import db, rows, get, put, uid, now
from . import model
from .jam import DECK, SOURCE

FIELDS=['meaning','reply','action','emotion']

def revealed_cards(c,code):
    s=get(c,'jam-'+code,'jam') or {}
    cards=set(s.get('revealed',[]))
    # Support rooms created before the archive feature without changing original data.
    for e in rows(c,code,'jam_event'):
        state=e['state']
        if state['phase'] in ['discussion','done'] and state.get('card') is not None:
            cards.add(state['card'])
    if s.get('phase') in ['discussion','done'] and s.get('card') is not None:
        cards.add(s['card'])
    return cards

def bundle(c,code):
    cards=revealed_cards(c,code)
    people={p['id']:p for p in rows(c,code,'participant') if p['consent']['classroom']}
    responses=[r for r in rows(c,code,'jam_response') if r['card'] in cards and r['participant'] in people]
    notes=[n for n in rows(c,code,'jam_note') if n['card'] in cards and (n['actor'] in people or n['group']=='Facilitator' or n.get('source_conclusion'))]
    room=get(c,code,'room') or {}
    return dict(room={k:room.get(k) for k in ['id','name','created_at','demo']},cards=sorted(cards),responses=responses,notes=notes,phase=(get(c,'jam-'+code,'jam') or {}).get('phase','lobby'),source=SOURCE)

def perform(run_id):
    with db() as c: run=get(c,run_id,'archive_run')
    try:
        groups=defaultdict(list)
        for item in run['inputs']: groups[item['scope']].append(item)
        pairs=[];lengths={}
        for group in groups.values():
            if len(group)<2: continue
            scores,tokens=model.encode([r['text'] for r in group])
            lengths.update({r['id']:int(n) for r,n in zip(group,tokens)})
            pairs.extend(dict(left=a['id'],right=b['id'],score=float(scores[i,j]),scope=a['scope']) for i,a in enumerate(group) for j,b in enumerate(group) if i<j)
        run.update(status='complete',pairs=sorted(pairs,key=lambda x:x['score'],reverse=True)[:100],pair_count=len(pairs),token_lengths=lengths,model=dict(model.state),finished_at=now())
    except Exception as e:
        run.update(status='failed',error=str(e),pairs=[],model=dict(model.state),finished_at=now())
    with db() as c: put(c,'*','archive_run',run)

def install(app,auth,check):
    router=APIRouter(prefix='/api/archive')
    def admin(c,h): return auth(c,h,roles=['admin'])
    @router.get('')
    def listing(authorization: str | None=Header(None)):
        with db() as c:
            admin(c,authorization);out=[]
            for (body,) in c.execute("SELECT body FROM records WHERE kind='room' ORDER BY rowid DESC"):
                r=json.loads(body)
                if not (r.get('tool') in ['jam','duo'] or get(c,'jam-'+r['id'],'jam')): continue
                b=bundle(c,r['id'])
                out.append(dict(**b['room'],phase=b['phase'],cards=b['cards'],responses=len(b['responses']),notes=len(b['notes'])))
            return {'rooms':out,'runs':rows(c,'*','archive_run'),'model':model.state['status']}
    @router.get('/rooms/{code}')
    def detail(code: str, authorization: str | None=Header(None)):
        with db() as c:
            admin(c,authorization);check(get(c,code,'room'),'Room not found',404)
            return bundle(c,code)
    @router.get('/rooms/{code}/export')
    def export(code: str, format: str='json', authorization: str | None=Header(None)):
        with db() as c:
            admin(c,authorization);check(get(c,code,'room'),'Room not found',404)
            data=bundle(c,code)
            data['analysis_runs']=[r for r in rows(c,'*','archive_run') if code in r['rooms']]
            data['human_reviews']=[r for r in rows(c,'*','archive_review') if r['run'] in [a['id'] for a in data['analysis_runs']]]
        if format=='json': return data
        check(format=='csv','Unknown format',422)
        buf=io.StringIO(newline='');w=csv.writer(buf)
        w.writerow(['record_type','id','created_at','room','card','participant','group','phase','language','field','text'])
        def safe(v):
            v=str(v if v is not None else '')
            return "'"+v if v.lstrip().startswith(('=','+','-','@')) else v
        for r in data['responses']:
            for field in ['meaning','choice','certainty','reply','action','familiarity','emotion']:
                w.writerow([safe(v) for v in ['response',r['id'],r['created_at'],code,r['card'],r['pid'],r['group'],r['phase'],r.get('language'),field,r['answers'].get(field,'')]])
        for n in data['notes']:
            w.writerow([safe(v) for v in ['note',n['id'],n['created_at'],code,n['card'],'',n['group'],'discussion','','note',n['text']]])
        return Response(buf.getvalue().encode('utf-8-sig'),media_type='text/csv',headers={'Content-Disposition':f'attachment; filename="{code}-jam.csv"'})
    @router.post('/analyze')
    def analyze(body:dict, tasks:BackgroundTasks, authorization:str|None=Header(None)):
        with db() as c:
            actor=admin(c,authorization)
            codes=body.get('rooms');field=body.get('field');phase=body.get('phase');card=body.get('card')
            check(isinstance(codes,list) and 0<len(codes)<=30 and all(isinstance(x,str) for x in codes),'Choose 1–30 rooms',422)
            codes=list(dict.fromkeys(codes))
            check(field in FIELDS and phase in ['initial','discussion'],'Choose a field and response phase',422)
            check(card is None or type(card) is int and 0<=card<8,'Invalid card',422)
            inputs=[]
            for code in codes:
                check(get(c,code,'room'),'Room not found',404)
                b=bundle(c,code)
                eligible=[r for r in b['responses'] if r['phase']==phase and (card is None or r['card']==card)]
                # Preserve all revisions in storage; analyze only the latest discussion version per person and card.
                latest={}
                for r in eligible: latest[(r['participant'],r['card'])]=r
                for r in latest.values():
                    text=r['answers'].get(field,'').strip()
                    if not text: continue
                    snapshot=r.get('scene',DECK[r['card']])
                    scope=hashlib.sha256(json.dumps(snapshot,ensure_ascii=False).encode()).hexdigest()
                    inputs.append(dict(id=r['id'],room=code,card=r['card'],pid=r['pid'],group=r['group'],language=r.get('language'),text=text,scene=snapshot,scope=scope,created_at=r['created_at']))
            sizes=defaultdict(int)
            for r in inputs: sizes[r['scope']]+=1
            check(any(n>=2 for n in sizes.values()),'At least two nonempty responses to the same scene are needed',422)
            check(len(inputs)<=500,'Choose fewer rooms (maximum 500 responses)',422)
            check(not any(r['status']=='running' for r in rows(c,'*','archive_run')),'Another analysis is running. Please wait.',409)
            run=put(c,'*','archive_run',dict(status='running',rooms=codes,field=field,phase=phase,card=card,inputs=inputs,pairs=[],actor=actor['id'],policy='Same scene only; fields and phases separate; latest discussion version; top 100 pairs'))
        tasks.add_task(perform,run['id'])
        return run
    @router.get('/runs/{id}')
    def getrun(id:str,authorization:str|None=Header(None)):
        with db() as c:
            admin(c,authorization);r=get(c,id,'archive_run');check(r,'Run not found',404)
            return {**r,'reviews':[x for x in rows(c,'*','archive_review') if x['run']==id]}
    @router.post('/runs/{id}/review')
    def review(id:str,body:dict,authorization:str|None=Header(None)):
        with db() as c:
            actor=admin(c,authorization);r=get(c,id,'archive_run');check(r and r['status']=='complete','Analysis not ready',409)
            check(any(p['left']==body.get('left') and p['right']==body.get('right') for p in r['pairs']),'Unknown pair',422)
            check(body.get('decision') in ['similar','different','uncertain'],'Choose a decision',422)
            return put(c,'*','archive_review',dict(run=id,left=body['left'],right=body['right'],decision=body['decision'],reason=str(body.get('reason',''))[:2000],actor=actor['id']))
    app.include_router(router)
