"""Real OpenAI Responses API. Secrets remain in process memory only."""
import os, json, time, asyncio
from .personality import compile_personality
import httpx
PROVIDER = os.environ.get('VCU_LLM_PROVIDER','ollama')
MODEL = os.environ.get('VCU_LLM_MODEL','qwen3:4b-instruct' if PROVIDER == 'ollama' else 'gpt-4.1-mini')
OLLAMA = 'http://127.0.0.1:11434'
_health = {'at':0, 'ready':False}

def failure_detail(event):
    response = event.get('response') or {}
    error = response.get('error') or event.get('error') or event
    code = str(error.get('code') or (response.get('incomplete_details') or {}).get('reason') or event.get('type') or 'unknown')
    # Preserve diagnostic codes, never echo upstream messages containing user input or credentials.
    code = ''.join(c for c in code if c.isalnum() or c in '._-')[:100]
    hints = {
        'insufficient_quota': 'API 사용 한도 또는 크레딧을 확인해 주세요.',
        'rate_limit_exceeded': '요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
        'server_error': 'OpenAI 서버 오류입니다. 잠시 후 다시 시도해 주세요.',
        'max_output_tokens': '답변 길이 제한에 도달했습니다.',
        'content_filter': '안전 필터로 응답이 중단되었습니다.',
        'invalid_api_key': 'API 키를 다시 연결해 주세요.',
    }
    return f"OpenAI [{code}]: {hints.get(code, '응답 생성에 실패했습니다. 이 오류 코드를 확인해 주세요.')}"

def config():
    if PROVIDER == 'ollama':
        if time.monotonic()-_health['at'] > 5:
            try:
                r=httpx.get(OLLAMA+'/api/tags',timeout=2);r.raise_for_status()
                _health['ready']=any(m['name']==MODEL for m in r.json().get('models',[]))
            except (httpx.HTTPError, ValueError): _health['ready']=False
            _health['at']=time.monotonic()
        return {'provider':'ollama','model':MODEL,'configured':_health['ready'],'local':True}
    return {'provider':'OpenAI','model':MODEL,'configured':bool(os.environ.get('OPENAI_API_KEY'))}

async def generate(prompt, question, on_delta, model_name=None):
    if PROVIDER == 'ollama':
        if model_name and model_name != MODEL:
            raise RuntimeError('모델이 변경되었습니다. 결론 확인 · AI 준비에서 페르소나를 다시 확정해 주세요.')
        prompt, profile = await asyncio.to_thread(compile_personality, prompt, MODEL, OLLAMA)
        result={'text':'','model':MODEL,'provider':'ollama','usage':None,'personality_profile':profile,'effective_prompt':prompt}
        done=False
        async with httpx.AsyncClient(timeout=httpx.Timeout(300,connect=10)) as client:
            async with client.stream('POST',OLLAMA+'/api/chat',json={'model':MODEL,'messages':[{'role':'system','content':prompt},{'role':'user','content':question}],'stream':True,'keep_alive':'30m','options':{'temperature':.7,'num_predict':600,'num_ctx':16384}}) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line: continue
                    event=json.loads(line)
                    if event.get('error'): raise RuntimeError('Ollama: '+str(event['error']))
                    result['text']+=event.get('message',{}).get('content','')
                    await on_delta(result['text'])
                    if event.get('done'):
                        done=True
                        result['usage']={k:event.get(k) for k in ['prompt_eval_count','eval_count','total_duration']}
        if not done or not result['text'].strip(): raise RuntimeError('Ollama 응답이 완료되지 않았습니다.')
        return result
    key=os.environ.get('OPENAI_API_KEY','')
    if not key: raise RuntimeError('OpenAI API key is not configured')
    model_name=model_name or MODEL
    result={'text':'','model':model_name,'response_id':None,'usage':None}
    async with httpx.AsyncClient(timeout=httpx.Timeout(90,connect=15)) as client:
        async with client.stream('POST','https://api.openai.com/v1/responses',headers={'Authorization':'Bearer '+key},json={'model':model_name,'instructions':prompt,'input':question,'temperature':0.7,'max_output_tokens':600,'store':False,'stream':True}) as response:
            if response.status_code!=200:
                await response.aread()
                try: detail=failure_detail(response.json())
                except (ValueError, TypeError, AttributeError): detail='OpenAI request failed'
                raise RuntimeError(f'{detail} (HTTP {response.status_code})')
            completed=False
            async for line in response.aiter_lines():
                if not line.startswith('data: '):continue
                payload=line[6:]
                if payload=='[DONE]':break
                event=json.loads(payload)
                if event.get('type')=='response.output_text.delta':
                    result['text']+=event.get('delta','')
                    await on_delta(result['text'])
                elif event.get('type')=='response.completed':
                    r=event['response'];result.update(model=r.get('model',model_name),response_id=r.get('id'),usage=r.get('usage'));completed=True
                elif event.get('type') in ['response.failed','error','response.incomplete']:
                    raise RuntimeError(failure_detail(event))
            if not completed or not result['text'].strip():raise RuntimeError('No complete AI answer received. Try again.')
    return result
