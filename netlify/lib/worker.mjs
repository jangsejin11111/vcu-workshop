import { randomUUID } from "node:crypto";
import { fail } from "./auth.mjs";
import { groups, text } from "./workshop.mjs";
export function worker(w, body, a) {
  fail(a.role === "admin", "Facilitator access required", 403);
  const id = text(body.worker, 100);
  fail(id, "Worker ID required");
  const now = Date.now() / 1000;
  if (["poll", "advertise"].includes(body.action)) {
    if (w.phase === "done") return { job: null, stop: true };
    const model = text(body.model, 100),
      digest = text(body.digest, 100),
      num_ctx = body.num_ctx;
    fail(
      model &&
        digest &&
        Number.isInteger(num_ctx) &&
        num_ctx >= 2048 &&
        num_ctx <= 65536,
      "Invalid local model",
    );
    const active = w.duo_chat.find(
      (c) => c.provider === "ollama" && c.status === "running",
    );
    // Only one computer owns a workshop while its heartbeat is fresh.
    fail(
      !w.local_ai || w.local_ai.worker === id || now - w.local_ai.seen_at > 60,
      "Another local worker is connected",
      409,
    );
    w.local_ai = { worker: id, model, digest, num_ctx, seen_at: now };
    if (active || body.action === "advertise") return { job: null };
    const job = w.duo_chat.find(
      (c) => c.provider === "ollama" && c.status === "queued",
    );
    if (!job) return { job: null };
    fail(
      job.model === model &&
        job.model_digest === digest &&
        job.num_ctx === num_ctx,
      "Queued question uses a different model. Reconnect that model.",
      409,
    );
    Object.assign(job, {
      status: "running",
      worker: id,
      lease: randomUUID(),
      lease_until: now + 90,
      sequence: 0,
    });
    return { job: structuredClone(job) };
  }
  const job = w.duo_chat.find((c) => c.id === body.job);
  fail(job && job.provider === "ollama", "Unknown local job", 404);
  fail(job.worker === id && job.lease === body.lease, "Wrong job lease", 403);
  if (job.status === "complete" || job.status === "failed") {
    fail(
      body.action === "finish" && job.sequence === body.sequence,
      "Job already ended",
      409,
    );
    return { ok: true };
  }
  fail(
    job.status === "running" && now <= job.lease_until,
    "Worker lease expired",
    409,
  );
  job.lease_until = now + 90;
  if (w.local_ai?.worker === id) w.local_ai.seen_at = now;
  if (body.action === "heartbeat") return { ok: true };
  fail(["progress", "finish"].includes(body.action), "Invalid worker action");
  fail(
    Number.isInteger(body.sequence) && body.sequence > 0,
    "Invalid sequence",
  );
  if (body.sequence <= job.sequence) return { ok: true };
  const answers = {};
  for (const g of groups) {
    const a = body.answers?.[g];
    fail(
      a && ["queued", "streaming", "complete", "failed"].includes(a.status),
      "Invalid answer status",
    );
    const value = text(a.text || "", 16000),
      error = text(a.error || "", 500);
    fail(a.status !== "complete" || value, "Empty complete answer");
    if (body.action === "finish")
      fail(
        ["complete", "failed"].includes(a.status),
        "Both answers must finish",
      );
    answers[g] = {
      status: a.status,
      text: value,
      error,
      model: job.model,
      model_digest: job.model_digest,
    };
    if (a.usage)
      answers[g].usage = Object.fromEntries(
        ["prompt_eval_count", "eval_count", "total_duration"]
          .filter((k) => Number.isFinite(a.usage[k]) && a.usage[k] >= 0)
          .map((k) => [k, a.usage[k]]),
      );
  }
  job.answers = answers;
  job.sequence = body.sequence;
  if (body.action === "finish") {
    job.status = groups.every((g) => answers[g].status === "complete")
      ? "complete"
      : "failed";
    job.finished_at = new Date().toISOString();
  }
  return { ok: true };
}
