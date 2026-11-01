"""Outbound-only Netlify ↔ local Ollama bridge. No public listener or OpenAI call."""
import argparse, copy, getpass, json, os, threading, time, uuid
from pathlib import Path
from urllib.parse import urlparse
import httpx

class Bridge:
    def __init__(self, site, room, password, model, num_ctx, ollama='http://127.0.0.1:11434'):
        assert urlparse(site).scheme == 'https' or urlparse(site).hostname in ('localhost','127.0.0.1'), 'Use HTTPS for cloud'
        assert urlparse(ollama).hostname in ('localhost','127.0.0.1','::1'), 'Ollama must be local'
        self.site,self.room,self.model,self.num_ctx,self.ollama=site.rstrip('/'),room,model,num_ctx,ollama
        self.cloud=httpx.Client(timeout=25)
        r=self.cloud.post(self.site+'/api/login',json={'password':password});r.raise_for_status()
        self.cloud.headers['Authorization']='Bearer '+r.json()['token']
        self.worker=str(uuid.uuid4())
        tags=httpx.get(ollama+'/api/tags',timeout=10);tags.raise_for_status()
        tag=next((x for x in tags.json()['models'] if x['name']==model),None)
        if not tag:raise RuntimeError('Download local model first: ollama pull '+model)
        self.digest=tag['digest']

    def send(self, body, retry=True):
        for attempt in range(3 if retry else 1):
            try:
                r=self.cloud.post(self.site+'/api/workshops/'+self.room+'/worker',json={'worker':self.worker,**body})
                if r.status_code in (401,403,404,409,422):
                    raise RuntimeError(str(r.status_code)+': '+r.json().get('detail','Worker rejected'))
                r.raise_for_status();return r.json()
            except (httpx.TransportError,httpx.HTTPStatusError):
                if attempt==2 or not retry:raise
                time.sleep(2)

    def run_job(self, job):
        identity={'job':job['id'],'lease':job['lease']}
        answers={g:{'status':'queued','text':''} for g in ['KR','US']}
        stop=threading.Event();lost=threading.Event();seq=0
        def heartbeat():
            while not stop.wait(15):
                try:self.send({**identity,'action':'heartbeat'})
                except Exception:lost.set();return
        thread=threading.Thread(target=heartbeat,daemon=True);thread.start()
        def save(action):
            nonlocal seq
            seq+=1
            self.send({**identity,'action':action,'sequence':seq,'answers':answers})
        try:
            # Sequential inference keeps both personas on the same model and avoids doubling GPU memory.
            for group in ['KR','US']:
                try:
                    if lost.is_set():raise RuntimeError('Cloud worker lease lost')
                    prompt=job['prompts'][group];question=job['question']
                    # UTF-8 bytes conservatively bound tokenizer length; never silently discard participant data.
                    if len((prompt+question).encode('utf-8'))+2048>self.num_ctx:
                        raise RuntimeError('Reference data exceeds local context budget. Increase --num-ctx; responses were not truncated.')
                    tags=httpx.get(self.ollama+'/api/tags',timeout=10)
                    tags.raise_for_status()
                    current=next((m for m in tags.json()['models'] if m['name']==job['model']),None)
                    if not current or current['digest']!=job['model_digest']:
                        raise RuntimeError('Local model changed after this question was queued. Restart the worker and ask again.')
                    answers[group]['status']='streaming';save('progress');last=time.monotonic();started=last;done=None
                    with httpx.stream('POST',self.ollama+'/api/chat',timeout=httpx.Timeout(300,connect=10),json={
                        'model':job['model'],'messages':[{'role':'system','content':prompt},{'role':'user','content':question}],
                        'stream':True,'keep_alive':'30m','options':{'temperature':job['temperature'],'num_predict':job['max_output_tokens'],'num_ctx':self.num_ctx}
                    }) as response:
                        response.raise_for_status()
                        for line in response.iter_lines():
                            if lost.is_set():raise RuntimeError('Cloud connection lost')
                            if time.monotonic()-started>600:raise RuntimeError('Local generation exceeded 10 minutes')
                            if not line:continue
                            event=json.loads(line)
                            if 'error' in event:raise RuntimeError('Ollama generation failed; check local model server')
                            answers[group]['text']+=event.get('message',{}).get('content','')
                            if time.monotonic()-last>3:save('progress');last=time.monotonic()
                            if event.get('done'):done=event
                    if not done or not answers[group]['text'].strip():raise RuntimeError('Local model returned no completed answer')
                    if done.get('done_reason')=='length':raise RuntimeError('Local answer reached output limit; partial text retained')
                    answers[group].update(status='complete',usage={k:done.get(k,0) for k in ['prompt_eval_count','eval_count','total_duration']})
                except Exception as error:
                    # Never upload raw HTTP exceptions/headers or source prompts.
                    safe=str(error) if isinstance(error,RuntimeError) else type(error).__name__+': local model or network error'
                    answers[group].update(status='failed',error=safe[:500])
                save('progress')
            save('finish')
            print('Finished',job['id'],{g:a['status'] for g,a in answers.items()},flush=True)
        finally:stop.set();thread.join(timeout=2)

    def run(self, once=False):
        print('Local AI connected:',self.site,self.room,self.model,'context',self.num_ctx,flush=True)
        while True:
            try:
                # Readiness is advertised only while the local model server is reachable.
                httpx.get(self.ollama+'/api/version',timeout=5).raise_for_status()
                result=self.send({'action':'poll','model':self.model,'digest':self.digest,'num_ctx':self.num_ctx})
                if result.get('stop'):
                    print('Workshop finished. Local worker stopped.',flush=True)
                    return
                if result.get('job'):self.run_job(result['job'])
                if once:return
            except Exception as error:
                print('Worker waiting:',type(error).__name__,str(error)[:180] if isinstance(error,RuntimeError) else 'Check local model/cloud connection',flush=True)
                if once:raise
            time.sleep(5)

class AutoBridge:
    """Discover rooms while a single inference loop serves them in round-robin order."""
    def __init__(self, bridge):
        self.bridge=bridge
        self.rooms={}
        self.lock=threading.Lock()
        self.stop=threading.Event()
        self.cursor=0

    def discover(self):
        # Never advertise readiness when Ollama is unavailable.
        httpx.get(self.bridge.ollama+'/api/version',timeout=5).raise_for_status()
        response=self.bridge.cloud.get(self.bridge.site+'/api/workshops')
        response.raise_for_status()
        connected={}
        for room in response.json():
            if room.get('phase') == 'done':
                continue
            b=copy.copy(self.bridge)
            b.room=room['id']
            try:
                result=b.send({'action':'advertise','model':b.model,'digest':b.digest,'num_ctx':b.num_ctx},retry=False)
                if not result.get('stop'):connected[b.room]=b
            except Exception as error:
                # A room owned by another worker must not prevent other rooms from connecting.
                print('Room unavailable:',b.room,type(error).__name__,flush=True)
        with self.lock:self.rooms=connected

    def serve_one(self):
        httpx.get(self.bridge.ollama+'/api/version',timeout=5).raise_for_status()
        with self.lock:rooms=list(self.rooms.values())
        if not rooms:return False
        start=self.cursor % len(rooms)
        for offset in range(len(rooms)):
            index=(start+offset)%len(rooms)
            b=rooms[index]
            try:
                result=b.send({'action':'poll','model':b.model,'digest':b.digest,'num_ctx':b.num_ctx})
            except Exception as error:
                print('Room poll failed:',b.room,type(error).__name__,flush=True)
                continue
            if result.get('job'):
                self.cursor=index+1
                print('Answering workshop:',b.room,flush=True)
                b.run_job(result['job'])
                return True
        return False

    def run(self):
        def discovery():
            while not self.stop.is_set():
                try:self.discover()
                except Exception as error:print('Discovery waiting:',type(error).__name__,flush=True)
                self.stop.wait(20)
        thread=threading.Thread(target=discovery,daemon=True)
        thread.start()
        print('Local AI auto-connect enabled. New workshops are discovered every 20 seconds.',flush=True)
        try:
            while not self.stop.is_set():
                try:worked=self.serve_one()
                except Exception as error:
                    print('Worker waiting:',type(error).__name__,flush=True)
                    worked=False
                if not worked:self.stop.wait(5)
        finally:
            self.stop.set()
            thread.join(timeout=30)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--site',required=True);p.add_argument('--room',help='Optional: restrict the worker to one workshop')
    p.add_argument('--model',default='qwen3:4b-instruct');p.add_argument('--num-ctx',type=int,default=32768)
    p.add_argument('--once',action='store_true')
    args=p.parse_args()
    password=os.environ.get('VCU_ADMIN_PASSWORD') or getpass.getpass('Facilitator password: ')
    bridge=Bridge(args.site,args.room,password,args.model,args.num_ctx)
    if args.room:bridge.run(args.once)
    elif args.once:
        auto=AutoBridge(bridge);auto.discover();auto.serve_one()
    else:AutoBridge(bridge).run()

if __name__=='__main__':main()
