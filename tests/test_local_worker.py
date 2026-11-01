import pytest
import copy
from scripts.local_ai_worker import Bridge

def test_worker_only_connects_to_local_model():
    with pytest.raises(AssertionError,match='Ollama must be local'):
        Bridge('https://test.example','1031a','secret','model',32768,ollama='https://external.example')

def test_worker_requires_cloud_https():
    with pytest.raises(AssertionError,match='Use HTTPS'):
        Bridge('http://external.example','1031a','secret','model',32768)

def test_oversized_reference_is_not_silently_truncated_or_sent(monkeypatch):
    b=Bridge.__new__(Bridge)
    b.num_ctx=2048
    b.ollama='http://127.0.0.1:11434'
    sent=[]
    b.send=lambda body:sent.append(copy.deepcopy(body))
    def forbidden(*args,**kwargs):raise AssertionError('Oversized context must not reach inference')
    monkeypatch.setattr('scripts.local_ai_worker.httpx.stream',forbidden)
    b.run_job({'id':'test','lease':'lease','prompts':{'KR':'notes','US':'notes'},'question':'question'})
    assert sent[-1]['action']=='finish'
    assert all(a['status']=='failed' and 'context budget' in a['error'] for a in sent[-1]['answers'].values())

def test_auto_discovers_new_rooms_and_rotates_without_mixing_jobs(monkeypatch):
    from scripts.local_ai_worker import AutoBridge
    import threading
    from types import SimpleNamespace
    rooms=[{'id':'1031a'}]
    response=SimpleNamespace(raise_for_status=lambda:None,json=lambda:rooms)
    monkeypatch.setattr('scripts.local_ai_worker.httpx.get',lambda *a,**k:response)
    jobs={'1031a':[{'id':'a1'},{'id':'a2'}],'1031b':[{'id':'b1'}]}
    calls=[]; finished=[]
    class Fake:
        site='https://test.example';ollama='http://127.0.0.1:11434';model='model';digest='digest';num_ctx=32768
        cloud=SimpleNamespace(get=lambda url:response)
        def send(self,body,retry=True):
            calls.append((self.room,body['action']))
            queue=jobs[self.room]
            return {'job':queue.pop(0) if body['action']=='poll' and queue else None}
        def run_job(self,job):finished.append((self.room,job['id']))
    auto=AutoBridge(Fake());auto.discover()
    assert jobs['1031a'][0]['id']=='a1'  # advertisements never claim questions
    rooms.append({'id':'1031b'});auto.discover()
    for _ in range(3):assert auto.serve_one()
    assert finished==[('1031a','a1'),('1031b','b1'),('1031a','a2')]
    assert set(auto.rooms)=={'1031a','1031b'}
