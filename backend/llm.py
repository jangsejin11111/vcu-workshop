"""Real OpenAI Responses API. Secrets remain in process memory only."""
import os, json
import httpx
MODEL = os.environ.get('VCU_LLM_MODEL','gpt-4.1-mini')

def config():
    return {'provider':'OpenAI','model':MODEL,'configured':bool(os.environ.get('OPENAI_API_KEY'))}

async def generate(prompt, question, on_delta, model_name=None):
    key=os.environ.get('OPENAI_API_KEY','')
    if not key: raise RuntimeError('OpenAI API key is not configured')
    model_name=model_name or MODEL
    result={'text':'','model':model_name,'response_id':None,'usage':None}
    async with httpx.AsyncClient(timeout=httpx.Timeout(90,connect=15)) as client:
        async with client.stream('POST','https://api.openai.com/v1/responses',headers={'Authorization':'Bearer '+key},json={'model':model_name,'instructions':prompt,'input':question,'temperature':0.7,'max_output_tokens':600,'store':False,'stream':True}) as response:
            if response.status_code!=200:
                raise RuntimeError(f'OpenAI request failed (HTTP {response.status_code}). Check API key, model access and billing.')
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
                    raise RuntimeError('OpenAI did not complete this answer. Partial output is retained; try a new comparison.')
            if not completed or not result['text'].strip():raise RuntimeError('No complete AI answer received. Try again.')
    return result
