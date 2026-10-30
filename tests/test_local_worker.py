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

