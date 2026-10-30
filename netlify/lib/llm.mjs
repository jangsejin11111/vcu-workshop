// Await both real requests within the function lifetime; never leave background promises.
export async function generate(
  prompt,
  question,
  model,
  env,
  onText,
  fetcher = fetch,
) {
  try {
    return await generateRequest(prompt, question, model, env, onText, fetcher);
  } catch (error) {
    if (error.publicMessage) throw error;
    const cause = error.cause?.code;
    const known = ['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE'];
    const reason = ['TimeoutError','AbortError'].includes(error.name)
      ? 'AI 요청 시간 초과 / AI request timed out'
      : known.includes(cause)
      ? `서버에서 OpenAI 연결 실패 / Network connection failed (${cause})`
      : error.name === 'SyntaxError'
      ? 'OpenAI 응답 형식 처리 실패 / Invalid response format'
      : error.name === 'TypeError'
      ? '네트워크 요청 또는 응답 본문 읽기 실패 / Request or response body failed (TypeError)'
      : '응답 처리 또는 중간 결과 저장 실패 / Response processing or saving failed';
    throw Object.assign(new Error(reason), {publicMessage: reason});
  }
}
async function generateRequest(prompt, question, model, env, onText, fetcher) {
  const key = (env.OPENAI_API_KEY || '').trim();
  if (!key || /[^\x21-\x7e]/.test(key) || key.startsWith('"') || key.startsWith("'"))
    throw Object.assign(new Error('Invalid key format'), {publicMessage:'API 키 형식 오류: 공백·줄바꿈·따옴표·한글 없이 키만 입력하세요. / Invalid API key format.'});
  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(43000),
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: prompt,
      input: question,
      temperature: 0.7,
      max_output_tokens: 600,
      store: false,
      stream: true,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const code = body.error?.code;
    const reason = code === 'insufficient_quota'
      ? 'OpenAI API 크레딧 또는 사용 한도가 부족합니다. / Insufficient API quota.'
      : response.status === 401
      ? 'API 키가 유효하지 않습니다. / Invalid API key.'
      : response.status === 403
      ? '프로젝트 또는 API 키 권한을 확인하세요. / Permission denied.'
      : response.status === 404
      ? '모델 이름 또는 모델 접근 권한을 확인하세요. / Model not found or unavailable.'
      : response.status === 429
      ? '요청 한도에 도달했습니다. 잠시 뒤 재시도하세요. / Rate limit reached.'
      : response.status === 400
      ? '모델이 요청 설정을 지원하지 않거나 입력이 너무 깁니다. / Invalid API request.'
      : 'OpenAI 서비스 오류입니다. / OpenAI service error.';
    throw Object.assign(new Error(reason), {publicMessage: `HTTP ${response.status}: ${reason}`});
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    text = "",
    completed = null,
    last = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") continue;
      const e = JSON.parse(raw);
      if (e.type === "response.output_text.delta") {
        text += e.delta;
        if (Date.now() - last > 1500) {
          await onText(text);
          last = Date.now();
        }
      }
      if (["error", "response.failed", "response.incomplete"].includes(e.type)) {
        const code = e.code || e.error?.code || e.response?.error?.code || e.response?.incomplete_details?.reason;
        const reasons = {
          insufficient_quota:'OpenAI API 크레딧 또는 사용 한도 부족 / Insufficient API quota',
          invalid_api_key:'API 키 인증 실패 / Invalid API key',
          rate_limit_exceeded:'OpenAI 요청 한도 초과 / Rate limit exceeded',
          model_not_found:'모델 접근 권한 또는 모델 이름 오류 / Model unavailable',
          max_output_tokens:'응답 길이 제한에 도달했습니다 / Output token limit reached',
          content_filter:'OpenAI에서 응답을 제한했습니다 / Response filtered',
          server_error:'OpenAI 내부 오류 / OpenAI server error',
        };
        throw Object.assign(new Error('OpenAI stream failed'), {publicMessage:reasons[code] || `OpenAI 응답 중단 / Stream interrupted (${e.type})`});
      }
      if (e.type === "response.completed") completed = e.response;
    }
  }
  if (!completed || !text.trim())
    throw Object.assign(new Error('Incomplete stream'), {publicMessage:'OpenAI 응답 연결이 완료 전에 종료됐습니다 / Stream ended before completion.'});
  return {
    text,
    model: completed.model,
    response_id: completed.id,
    usage: completed.usage,
    status: "complete",
  };
}

