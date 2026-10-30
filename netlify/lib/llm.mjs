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
  if (!response.ok)
    throw Error(
      `OpenAI HTTP ${response.status}. Check API key, model access and API credit.`,
    );
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
