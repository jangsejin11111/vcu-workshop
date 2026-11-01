from backend.llm import failure_detail

def test_failure_codes():
    assert 'server_error' in failure_detail({'type':'response.failed','response':{'error':{'code':'server_error','message':'secret'}}})
    assert 'secret' not in failure_detail({'error':{'code':'insufficient_quota','message':'secret'}})
    assert 'max_output_tokens' in failure_detail({'type':'response.incomplete','response':{'incomplete_details':{'reason':'max_output_tokens'}}})
