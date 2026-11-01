import { randomUUID, randomInt } from "node:crypto";
import content from "./content.json" with { type: "json" };
import { fail } from "./auth.mjs";
export const groups = ["KR", "US"];
export const localMode = (env) => env.VCU_AI_PROVIDER !== "openai";
export const model = (env) =>
  localMode(env)
    ? env.VCU_LOCAL_MODEL || "qwen3:4b-instruct"
    : env.VCU_LLM_MODEL || "gpt-4.1-mini";
export const latest = (items, key) => [
  ...new Map(items.map((x) => [key(x), x])).values(),
];
export const text = (s = "", limit = 4000) => {
  fail(typeof s === "string" && s.length <= limit, "Text too long");
  return s.trim();
};
export function add(w, kind, fields) {
  const row = {
    id: randomUUID(),
    room: w.code,
    created_at: new Date().toISOString(),
    ...structuredClone(fields),
  };
  w[kind].push(row);
  return row;
}
export function create(code, body) {
  return {
    code,
    name: text(body.name || "Same words · Two rooms", 120),
    demo: !!body.demo,
    phase: "lobby",
    round: null,
    drawn: [],
    started_at: null,
    persona: null,
    participant: [],
    duo_round: [],
    duo_edit: [],
    duo_conclusion: [],
    duo_persona: [],
    duo_chat: [],
    duo_event: [],
  };
}
export function expire(w, now = Date.now() / 1000) {
  let changed = false;
  if (
    w.phase === "discussion" &&
    now >= w.duo_round.find((r) => r.id === w.round).ends_at
  ) {
    close(w, "timer");
    changed = true;
  }
  for (const chat of w.duo_chat) {
    const timedOut =
      chat.provider === "ollama"
        ? (chat.status === "queued" && now - chat.started_at > 600) ||
          (chat.status === "running" &&
            (now > chat.lease_until || now - chat.started_at > 1800))
        : chat.status === "running" && now - chat.started_at > 58;
    if (timedOut) {
      chat.status = "failed";
      chat.finished_at = new Date().toISOString();
      for (const a of Object.values(chat.answers))
        if (!["complete", "failed"].includes(a.status))
          Object.assign(a, {
            status: "failed",
            error: "AI request interrupted or timed out. Ask again.",
          });
      changed = true;
    }
  }
  return changed;
}
export function close(w, reason) {
  if (w.phase !== "discussion") return;
  Object.assign(
    w.duo_round.find((r) => r.id === w.round),
    {
      status: "closed",
      closed_at: new Date().toISOString(),
      close_reason: reason,
    },
  );
  w.phase = "round_closed";
  add(w, "duo_event", { action: "round_closed", round: w.round, reason });
}
export function publicState(w, a, env) {
  const p = w.participant.find((p) => p.id === a.participant);
  fail(a.role !== "participant" || p, "Participant not found", 401);
  const allowed = p ? [p.group] : groups;
  const edits = w.duo_edit.filter((e) => allowed.includes(e.group));
  return {
    id: w.code,
    code: w.code,
    name: w.name,
    phase: w.phase,
    round: w.round,
    drawn: w.drawn,
    started_at: w.started_at,
    persona: w.persona,
    role: a.role,
    group: p?.group,
    participant: a.participant,
    server_time: Date.now() / 1000,
    rounds: w.duo_round,
    participants: w.participant
      .filter((p) => allowed.includes(p.group))
      .map((p) => ({
        id: p.id,
        pid: p.pid,
        nickname: p.nickname || p.pid,
        online: Date.now()/1000 - (p.last_seen || 0) < 60,
        group: p.group,
        typing:
          w.phase === "discussion" &&
          edits.some(
            (e) =>
              e.participant === p.id &&
              e.round === w.round &&
              Date.now() / 1000 - e.saved_at < 8,
          ),
      })),
    edits: latest(edits, (e) => e.round + e.participant),
    conclusions: latest(
      w.duo_conclusion.filter((n) => allowed.includes(n.group)),
      (n) => n.round + n.group,
    ),
    personas:
      a.role === "admin"
        ? w.duo_persona
        : w.duo_persona.map((v) => ({
            id: v.id,
            version: v.version,
            created_at: v.created_at,
          })),
    chats: w.duo_chat.map((c) =>
      a.role === "admin"
        ? c
        : Object.fromEntries(
            Object.entries(c).filter(
              ([k]) =>
                !["prompts", "actor", "request_id", "lease", "worker"].includes(
                  k,
                ),
            ),
          ),
    ),
    analyses: [],
    llm: {
      provider: localMode(env) ? "Ollama · local" : "OpenAI",
      model: localMode(env) ? w.local_ai?.model || model(env) : model(env),
      configured: localMode(env)
        ? Date.now() / 1000 - (w.local_ai?.seen_at || 0) < 60
        : !!env.OPENAI_API_KEY,
      local: localMode(env),
      cloud: true,
    },
  };
}
export function mutate(w, action, body, a, env) {
  const admin = () =>
    fail(a.role === "admin", "Facilitator access required", 403);
  if (action === "join") {
    fail(w.phase !== "done", "Workshop finished", 409);
    fail(groups.includes(body.group), "Choose Korea or US room");
    fail(body.consent === true, "Sharing and AI use consent required");
    fail(w.participant.length < 150, "Workshop participant limit reached", 409);
    const nickname = text(body.nickname || "", 24);
    fail(nickname.length > 0 && !/[\u0000-\u001f\u007f]/u.test(nickname), "닉네임을 1–24자로 입력해 주세요. / Enter a nickname (1–24 characters).");
    fail(!w.participant.some(p => p.group === body.group && (p.nickname || "").normalize("NFKC").toLowerCase() === nickname.normalize("NFKC").toLowerCase()), "같은 방에 사용 중인 닉네임입니다. / This nickname is already in use in this room.", 409);
    const group = body.group,
      count = w.participant.filter((p) => p.group === group).length;
    return add(w, "participant", {
      group,
      nickname,
      pid: (group === "KR" ? "K" : "U") + String(count + 1).padStart(2, "0"),
      language: body.language === "en" ? "en" : "ko",
      consent: {
        external_ai: true,
        classroom: true,
        training: false,
        quote: false,
      },
    });
  }
  if (action === "control") {
    admin();
    const now = Date.now() / 1000;
    switch (body.action) {
      case "start":
        fail(!w.started_at, "Clock already started", 409);
        w.started_at = now;
        break;
      case "draw": {
        fail(
          ["lobby", "round_closed"].includes(w.phase),
          "Close current activity first",
          409,
        );
        const available = content.DECK.map((_, i) => i).filter(
          (i) => !w.drawn.includes(i),
        );
        fail(available.length, "All cards used", 409);
        const minutes = body.minutes ?? 5,
          card = body.card ?? available[randomInt(available.length)];
        fail(
          Number.isInteger(minutes) && minutes >= 1 && minutes <= 30,
          "Choose 1–30 minutes",
        );
        fail(available.includes(card), "Invalid or used card");
        const r = add(w, "duo_round", {
          number: w.drawn.length + 1,
          card,
          scene: content.DECK[card],
          status: "open",
          started_at: now,
          ends_at: now + minutes * 60,
        });
        Object.assign(w, {
          phase: "discussion",
          round: r.id,
          drawn: [...w.drawn, card],
          started_at: w.started_at || now,
        });
        break;
      }
      case "close":
        fail(w.phase === "discussion", "No open round", 409);
        close(w, "facilitator");
        break;
      case "extend":
        fail(w.phase === "discussion", "Round ended", 409);
        w.duo_round.find((r) => r.id === w.round).ends_at += 60;
        break;
      case "prepare":
        close(w, "prepare_personas");
        fail(
          ["round_closed", "prepare", "compare"].includes(w.phase),
          "Collect notes first",
          409,
        );
        w.phase = "prepare";
        break;
      case "finish":
        close(w, "finish");
        w.phase = "done";
        break;
      default:
        fail(false, "Unknown action");
    }
    add(w, "duo_event", {
      action: body.action,
      phase: w.phase,
      round: w.round,
    });
    return { ok: true };
  }
  if (action === "edit") {
    fail(a.role === "participant", "Participant access required", 403);
    fail(
      w.phase === "discussion" && body.round === w.round,
      "Discussion timer ended",
      409,
    );
    const p = w.participant.find((p) => p.id === a.participant);
    fail(p, "Unknown participant", 403);
    const ans = body.answers;
    fail(
      ans && typeof ans === "object" && !Array.isArray(ans),
      "Invalid answers",
    );
    const answers = {};
    for (const [k, v] of Object.entries(ans)) {
      fail(
        [
          "meaning",
          "reply",
          "action",
          "emotion",
          "choice",
          "certainty",
          "familiarity",
        ].includes(k),
        "Invalid field",
      );
      answers[k] = text(v, 3000);
    }
    if ("choice" in answers)
      fail(
        ["", "literal", "other", "both", "unsure"].includes(answers.choice),
        "Invalid choice",
      );
    for (const k of ["certainty", "familiarity"])
      if (k in answers)
        fail(
          ["", "1", "2", "3", "4", "5"].includes(answers[k]),
          "Scale must be 1–5",
        );
    const prev = w.duo_edit
        .filter((e) => e.round === w.round && e.participant === p.id)
        .at(-1),
      version = prev?.version || 0;
    fail(
      body.base_version === version,
      "Newer edit exists. Reload the saved version.",
      409,
    );
    return add(w, "duo_edit", {
      round: w.round,
      participant: p.id,
      pid: p.pid,
      group: p.group,
      language: body.language === "en" ? "en" : "ko",
      answers,
      version: version + 1,
      saved_at: Date.now() / 1000,
    });
  }
  if (action === "conclusion") {
    fail(["admin", "participant"].includes(a.role), "Read-only screen", 403);
    const r = w.duo_round.find((r) => r.id === body.round);
    fail(r, "Unknown round", 404);
    const group =
      a.role === "admin"
        ? body.group
        : w.participant.find((p) => p.id === a.participant)?.group;
    fail(groups.includes(group), "Invalid group");
    fail(
      ["discussion", "round_closed", "prepare"].includes(w.phase),
      "Notes closed",
      409,
    );
    fail(
      a.role === "admin" || (w.phase === "discussion" && r.id === w.round),
      "Facilitator finalizes notes after timer",
      409,
    );
    const version =
      w.duo_conclusion
        .filter((n) => n.round === r.id && n.group === group)
        .at(-1)?.version || 0;
    fail(
      body.base_version === version,
      "Another person edited this note. Load the saved note.",
      409,
    );
    const english = text(body.english),
      original = text(body.original),
      approved = a.role === "admin" && body.approved === true;
    fail(!approved || english, "English note required");
    return add(w, "duo_conclusion", {
      round: r.id,
      group,
      english,
      original,
      approved,
      version: version + 1,
      actor: a.participant || a.id,
    });
  }
  if (action === "personas") {
    admin();
    fail(w.phase === "prepare", "Finish discussions first", 409);
    const closed = w.duo_round.filter((r) => r.status === "closed"),
      ns = latest(w.duo_conclusion, (n) => n.round + n.group).filter((n) =>
        closed.some((r) => r.id === n.round),
      );
    fail(
      closed.length &&
        closed.every((r) =>
          groups.every((g) =>
            ns.some(
              (n) =>
                n.round === r.id && n.group === g && n.approved && n.english,
            ),
          ),
        ),
      "Each card needs confirmed English notes from both groups",
      409,
    );
    const individuals = { KR: [], US: [] };
    for (const e of latest(w.duo_edit, (e) => e.round + e.participant)) {
      const r = closed.find((r) => r.id === e.round);
      if (
        !r ||
        !w.participant.find((p) => p.id === e.participant)?.consent
          .external_ai ||
        !Object.values(e.answers).some(Boolean)
      )
        continue;
      individuals[e.group].push({
        source_edit: e.id,
        round: r.id,
        round_number: r.number,
        scene: r.scene,
        language: e.language,
        answers: e.answers,
        version: e.version,
      });
    }
    const prompts = {};
    for (const g of groups) {
      const ref = individuals[g].map(
        ({ round_number, scene, language, answers }) => ({
          round_number,
          scene,
          language,
          answers,
        }),
      );
      prompts[g] =
        content.TEMPLATE.replace(
          "{notes}",
          ns
            .filter((n) => n.group === g)
            .map((n) => "- " + n.english)
            .join("\n"),
        ) +
        content.INDIVIDUAL_GUIDANCE.replace(
          "{responses}",
          JSON.stringify(ref, null, 2),
        );
      fail(
        prompts[g].length < 100000,
        "Too much reference text; shorten notes before creating personas",
      );
    }
    const v = add(w, "duo_persona", {
      version: w.duo_persona.length + 1,
      template: content.TEMPLATE,
      individual_template: content.INDIVIDUAL_GUIDANCE,
      individual_responses: individuals,
      notes: ns,
      prompts,
      method: "prompt_conditioning",
      model: localMode(env) ? w.local_ai?.model || model(env) : model(env),
    });
    w.phase = "compare";
    w.persona = v.id;
    return v;
  }
  if (action === "chat") {
    admin();
    fail(w.phase === "compare", "Prepare personas first", 409);
    const question = text(body.question, 2000),
      request_id = text(body.request_id, 100);
    fail(question && request_id, "Question and request ID required");
    const existing = w.duo_chat.find((c) => c.request_id === request_id);
    if (existing) return { run: existing, created: false };
    fail(
      localMode(env)
        ? Date.now() / 1000 - (w.local_ai?.seen_at || 0) < 60
        : env.OPENAI_API_KEY,
      localMode(env)
        ? "진행자 컴퓨터에서 로컬 AI 연결 프로그램을 실행하세요. / Start the local AI worker."
        : "Set OPENAI_API_KEY in Netlify environment variables and redeploy.",
      503,
    );
    fail(
      !w.duo_chat.some((c) => ["queued", "running"].includes(c.status)),
      "Wait for the current answers",
      409,
    );
    fail(
      w.duo_chat.length < 100,
      "100 comparison limit per workshop reached",
      409,
    );
    const v = w.duo_persona.find((v) => v.id === w.persona);
    const run = add(w, "duo_chat", {
      status: localMode(env) ? "queued" : "running",
      provider: localMode(env) ? "ollama" : "openai",
      started_at: Date.now() / 1000,
      question,
      request_id,
      persona: v.id,
      version: v.version,
      prompts: v.prompts,
      model: localMode(env) ? w.local_ai.model : v.model,
      model_digest: localMode(env) ? w.local_ai.digest : null,
      num_ctx: localMode(env) ? w.local_ai.num_ctx : null,
      temperature: 0.7,
      max_output_tokens: 600,
      answers: {
        KR: { status: "queued", text: "" },
        US: { status: "queued", text: "" },
      },
      actor: a.id,
      context_mode: "independent identical question, no chat history",
    });
    return { run, created: true };
  }
  fail(false, "Unknown endpoint", 404);
}
export function exported(w) {
  return {
    schema: "vcu-cloud-v1",
    exported_at: new Date().toISOString(),
    room: { id: w.code, name: w.name },
    duo: [
      {
        code: w.code,
        phase: w.phase,
        round: w.round,
        drawn: w.drawn,
        started_at: w.started_at,
        persona: w.persona,
      },
    ],
    ...Object.fromEntries(
      Object.entries(w).filter(([k]) => k.startsWith("duo_")),
    ),
  };
}
export function csv(w) {
  const fields = [
    "round",
    "card",
    "group",
    "pid",
    "version",
    "meaning",
    "choice",
    "certainty",
    "reply",
    "action",
    "familiarity",
    "emotion",
  ];
  const cell = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const rows = latest(w.duo_edit, (e) => e.round + e.participant).map((e) => {
    const r = w.duo_round.find((r) => r.id === e.round);
    return { ...e, ...e.answers, round: r.number, card: r.scene[3] };
  });
  return (
    "\uFEFF" +
    [fields, ...rows.map((r) => fields.map((k) => r[k]))]
      .map((r) => r.map(cell).join(","))
      .join("\r\n")
  );
}
