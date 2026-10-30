import pytest
from scripts.local_ai_worker import Bridge

def test_worker_only_connects_to_local_model():
    with pytest.raises(AssertionError,match='Ollama must be local'):
        Bridge('https://test.example','1031a','secret','model',32768,ollama='https://external.example')

def test_worker_requires_cloud_https():
    with pytest.raises(AssertionError,match='Use HTTPS'):
        Bridge('http://external.example','1031a','secret','model',32768)

