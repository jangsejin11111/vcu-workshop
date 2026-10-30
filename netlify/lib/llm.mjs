// Await both real requests within the function lifetime; never leave background promises.
export async function generate(
  prompt,
  question,
  model,
  env,
  onText,
  fetcher = fetch,
) {
  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(43000),
    headers: {
      Authorization: "Bearer " + env.OPENAI_API_KEY,
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
      if (["error", "response.failed", "response.incomplete"].includes(e.type))
        throw Error("OpenAI could not complete the response. Please retry.");
      if (e.type === "response.completed") completed = e.response;
    }
  }
  if (!completed || !text.trim())
    throw Error("OpenAI stream ended without a complete answer.");
  return {
    text,
    model: completed.model,
    response_id: completed.id,
    usage: completed.usage,
    status: "complete",
  };
}

