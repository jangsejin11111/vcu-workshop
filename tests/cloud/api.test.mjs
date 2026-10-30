import test from "node:test";
import assert from "node:assert/strict";
import { handler } from "../../netlify/functions/api.mjs";
import { update } from "../../netlify/lib/store.mjs";
import { generate } from "../../netlify/lib/llm.mjs";

class MemoryStore {
  data = new Map();
  seq = 0;
  async get(k) {
    return structuredClone(this.data.get(k)?.data ?? null);
  }
  async getWithMetadata(k) {
    return structuredClone(this.data.get(k) ?? null);
  }
  async setJSON(k, v, o = {}) {
    const old = this.data.get(k);
    if ((o.onlyIfNew && old) || (o.onlyIfMatch && old?.etag !== o.onlyIfMatch))
      return { modified: false };
    const etag = String(++this.seq);
    this.data.set(k, { data: structuredClone(v), etag });
    return { modified: true, etag };
  }
  async list({ prefix }) {
    return {
      blobs: [...this.data.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((key) => ({ key })),
    };
  }
}
const env = {
  VCU_AI_PROVIDER: "openai",
  VCU_AUTH_SECRET: "test-only-secret-at-least-32-characters",
  VCU_ADMIN_PASSWORD: "test-pass",
  OPENAI_API_KEY: "test-only",
};

test("AI failure and interrupted runs retain errors; missing key blocks real calls", async () => {
  const f = fixture(async () => {
      throw Error("simulated transport failure");
    }),
    x = await ready(f);
  await update(f.store, "rooms/" + x.code, (w) => {
    w.phase = "compare";
    w.persona = "v";
    w.duo_persona.push({
      id: "v",
      version: 1,
      prompts: { KR: "k", US: "u" },
      model: "m",
    });
    return { write: true };
  });
  const result = await f.req(
    x.root + "/chat",
    { question: "q", request_id: "failure" },
    x.admin,
  );
  assert.equal(result.data.status, "failed");
  assert.equal(result.data.answers.KR.text, "");
  assert.equal(result.data.answers.US.status, "failed");
  await update(f.store, "rooms/" + x.code, (w) => {
    w.duo_chat[0].status = "running";
    w.duo_chat[0].started_at = 0;
    w.duo_chat[0].answers.KR = { status: "streaming", text: "partial" };
    return { write: true };
  });
  assert.equal(
    (await f.req(x.root, undefined, x.admin)).data.chats[0].status,
    "failed",
  );
  const noKey = handler({
    getStore: () => f.store,
    env: { ...env, OPENAI_API_KEY: "" },
  });
  const response = await noKey(
    new Request("https://test.example/api" + x.root + "/chat", {
      method: "POST",
      headers: { Authorization: "Bearer " + x.admin },
      body: JSON.stringify({ question: "q", request_id: "no-key" }),
    }),
  );
  assert.equal(response.status, 503);
});
function fixture(
  generator = async (p, q, m, e, delta) => {
    await delta("partial");
    return { status: "complete", text: "TEST ONLY", model: m };
  },
  testEnv = env,
) {
  const store = new MemoryStore(),
    api = handler({
      getStore: () => store,
      env: testEnv,
      generateAI: generator,
    });
  async function req(path, body, token) {
    const r = await api(
      new Request("https://test.example/api" + path, {
        method: body ? "POST" : "GET",
        headers: {
          authorization: "Bearer " + (token || ""),
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      { ip: "127.0.0.1" },
    );
    const raw = await r.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    return { status: r.status, data };
  }
  return { store, req };
}
async function ready(f) {
  const admin = (await f.req("/login", { password: "test-pass" })).data.token;
  const code = (await f.req("/workshops", {}, admin)).data.id,
    root = "/workshops/" + code;
  const kr = (await f.req(root + "/join", { group: "KR", consent: true })).data
    .token;
  const us = (await f.req(root + "/join", { group: "US", consent: true })).data
    .token;
  await f.req(
    root + "/control",
    { action: "draw", card: 0, minutes: 5 },
    admin,
  );
  const state = (await f.req(root, undefined, admin)).data;
  return { admin, code, root, kr, us, round: state.round };
}
test("same card, group privacy, optimistic edits, readonly screen and timer", async () => {
  const f = fixture(),
    x = await ready(f);
  const body = {
    round: x.round,
    base_version: 0,
    answers: {
      meaning: "K-only",
      choice: "other",
      certainty: "4",
      familiarity: "2",
      reply: "reply",
      action: "action",
    },
  };
  assert.equal((await f.req(x.root + "/edit", body, x.kr)).status, 200);
  assert.equal((await f.req(x.root + "/edit", body, x.kr)).status, 409);
  assert.equal(
    (
      await f.req(
        x.root + "/edit",
        { ...body, base_version: 1, answers: { certainty: "9" } },
        x.kr,
      )
    ).status,
    422,
  );
  const us = (await f.req(x.root, undefined, x.us)).data;
  assert.equal(us.edits.length, 0);
  assert.equal(us.participants.length, 1);
  assert.equal(us.round, x.round);
  const screen = (await f.req("/rooms/" + x.code + "/screen", {}, x.admin)).data
    .token;
  assert.equal(
    (await f.req(x.root + "/control", { action: "close" }, screen)).status,
    403,
  );
  assert.equal((await f.req(x.root + "/export", undefined, x.kr)).status, 403);
  await update(f.store, "rooms/" + x.code, (w) => {
    w.duo_round[0].ends_at = 0;
    return { write: true };
  });
  assert.equal(
    (await f.req(x.root + "/edit", { ...body, base_version: 1 }, x.kr)).status,
    409,
  );
  assert.equal(
    (await f.req(x.root, undefined, x.admin)).data.phase,
    "round_closed",
  );
  assert.equal(
    (await f.req(x.root + "/export", undefined, x.admin)).data.duo_edit.length,
    1,
  );
});
test("CAS preserves simultaneous writes", async () => {
  const s = new MemoryStore();
  await s.setJSON("x", { n: 0 });
  await Promise.all(
    Array.from({ length: 12 }, () =>
      update(s, "x", (v) => {
        v.n++;
        return { write: true };
      }),
    ),
  );
  assert.equal((await s.get("x")).n, 12);
});
test("personas use latest own-group responses and both requests share settings; idempotent", async () => {
  const calls = [],
    f = fixture(async (p, q, m, e, delta) => {
      calls.push({ p, q, m });
      await delta("partial");
      return { status: "complete", text: "TEST ONLY" };
    }),
    x = await ready(f);
  for (const [tk, meaning] of [
    [x.kr, "KR old"],
    [x.us, "US own"],
  ])
    await f.req(
      x.root + "/edit",
      { round: x.round, base_version: 0, answers: { meaning } },
      tk,
    );
  await f.req(
    x.root + "/edit",
    { round: x.round, base_version: 1, answers: { meaning: "KR latest" } },
    x.kr,
  );
  await f.req(x.root + "/control", { action: "prepare" }, x.admin);
  assert.equal((await f.req(x.root + "/personas", {}, x.admin)).status, 409);
  for (const group of ["KR", "US"])
    assert.equal(
      (
        await f.req(
          x.root + "/conclusion",
          {
            round: x.round,
            group,
            base_version: 0,
            english: group + " note",
            approved: true,
          },
          x.admin,
        )
      ).status,
      200,
    );
  const persona = (await f.req(x.root + "/personas", {}, x.admin)).data;
  assert.match(persona.prompts.KR, /KR latest/);
  assert.doesNotMatch(persona.prompts.KR, /KR old|US own/);
  assert.match(persona.prompts.US, /US own/);
  assert.equal(persona.individual_responses.KR.length, 1);
  const body = { question: "Same question", request_id: "same-request" };
  assert.equal(
    (await f.req(x.root + "/chat", body, x.admin)).data.status,
    "complete",
  );
  await f.req(x.root + "/chat", body, x.admin);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].q, calls[1].q);
  assert.equal(calls[0].m, calls[1].m);
  const out = (await f.req(x.root + "/export", undefined, x.admin)).data;
  assert.equal(out.duo_edit.length, 3);
  assert.equal(out.duo_chat.length, 1);
});
test("login throttling and invalid sessions", async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++)
    assert.equal((await f.req("/login", { password: "wrong" })).status, 401);
  assert.equal((await f.req("/login", { password: "test-pass" })).status, 429);
  assert.equal((await f.req("/workshops", undefined, "bad")).status, 401);
});
test("OpenAI contract parses real SSE format and fails incomplete streams without synthetic answers", async () => {
  let sent;
  const mock = async (url, options) => {
    sent = JSON.parse(options.body);
    return new Response(
      "data: " +
        JSON.stringify({ type: "response.output_text.delta", delta: "hello" }) +
        "\n\ndata: " +
        JSON.stringify({
          type: "response.completed",
          response: { model: "m", id: "r", usage: { output_tokens: 1 } },
        }) +
        "\n\n",
    );
  };
  const answer = await generate(
    "prompt",
    "question",
    "m",
    env,
    async () => {},
    mock,
  );
  assert.equal(answer.text, "hello");
  assert.equal(sent.store, false);
  assert.equal(sent.temperature, 0.7);
  assert.equal(sent.stream, true);
  await assert.rejects(() =>
    generate(
      "p",
      "q",
      "m",
      env,
      async () => {},
      async () =>
        new Response(
          'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
        ),
    ),
  );
});

test("local jobs require a live worker, isolate leases, preserve progress, and never invoke OpenAI", async () => {
  const f = fixture(
      async () => {
        throw Error("OpenAI must not be invoked");
      },
      { ...env, VCU_AI_PROVIDER: "local", OPENAI_API_KEY: "" },
    ),
    x = await ready(f);
  await update(f.store, "rooms/" + x.code, (w) => {
    w.phase = "compare";
    w.persona = "v";
    w.duo_persona.push({
      id: "v",
      version: 1,
      model: "old-openai-model",
      prompts: { KR: "KR notes", US: "US notes" },
    });
    return { write: true };
  });
  const question = { question: "hello", request_id: "local-1" },
    poll = {
      action: "poll",
      worker: "worker-1",
      model: "qwen3:4b-instruct",
      digest: "digest-1",
      num_ctx: 32768,
    };
  assert.equal((await f.req(x.root + "/chat", question, x.admin)).status, 503);
  assert.equal((await f.req(x.root + "/worker", poll, x.kr)).status, 403);
  assert.equal((await f.req(x.root + "/worker", poll, x.admin)).status, 200);
  const queued = (await f.req(x.root + "/chat", question, x.admin)).data;
  assert.equal(queued.status, "queued");
  assert.equal(queued.provider, "ollama");
  assert.equal(queued.model, poll.model);
  const { job } = (await f.req(x.root + "/worker", poll, x.admin)).data;
  assert.deepEqual(job.prompts, { KR: "KR notes", US: "US notes" });
  assert.equal(
    (await f.req(x.root + "/worker", { ...poll, worker: "other" }, x.admin))
      .status,
    409,
  );
  assert.equal((await f.req(x.root + "/worker", poll, x.admin)).data.job, null);
  const base = { worker: "worker-1", job: job.id, lease: job.lease },
    answers = {
      KR: { status: "streaming", text: "partial" },
      US: { status: "queued", text: "" },
    };
  assert.equal(
    (
      await f.req(
        x.root + "/worker",
        { ...base, lease: "wrong", action: "heartbeat" },
        x.admin,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.req(
        x.root + "/worker",
        { ...base, action: "progress", sequence: 2, answers },
        x.admin,
      )
    ).status,
    200,
  );
  await f.req(
    x.root + "/worker",
    {
      ...base,
      action: "progress",
      sequence: 1,
      answers: { KR: { status: "streaming", text: "old" }, US: answers.US },
    },
    x.admin,
  );
  const state = (await f.req(x.root, undefined, x.kr)).data;
  assert.equal(state.chats[0].answers.KR.text, "partial");
  assert.equal(state.chats[0].lease, undefined);
  assert.equal(state.chats[0].prompts, undefined);
  const final = {
    ...base,
    action: "finish",
    sequence: 3,
    answers: {
      KR: { status: "complete", text: "K answer" },
      US: { status: "complete", text: "U answer" },
    },
  };
  assert.equal((await f.req(x.root + "/worker", final, x.admin)).status, 200);
  assert.equal((await f.req(x.root + "/worker", final, x.admin)).status, 200);
  assert.equal(
    (await f.req(x.root, undefined, x.admin)).data.chats[0].status,
    "complete",
  );
  const dup = (await f.req(x.root + "/chat", question, x.admin)).data;
  assert.equal(dup.id, job.id);
  const next = (
    await f.req(
      x.root + "/chat",
      { ...question, request_id: "local-2" },
      x.admin,
    )
  ).data;
  await f.req(x.root + "/worker", poll, x.admin);
  await update(f.store, "rooms/" + x.code, (w) => {
    w.duo_chat.find((c) => c.id === next.id).lease_until = 0;
    return { write: true };
  });
  assert.equal(
    (await f.req(x.root, undefined, x.admin)).data.chats.at(-1).status,
    "failed",
  );
});

