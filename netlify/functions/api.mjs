import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { cloudStore, update } from "../lib/store.mjs";
import { authenticate, issue, equal, fail } from "../lib/auth.mjs";
import {
  create,
  expire,
  publicState,
  mutate,
  exported,
  csv,
  groups,
} from "../lib/workshop.mjs";
import { generate } from "../lib/llm.mjs";
import { worker } from "../lib/worker.mjs";
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
function dateCode(index) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  let n = index + 1,
    suffix = "";
  while (n) {
    n--;
    suffix = String.fromCharCode(97 + (n % 26)) + suffix;
    n = Math.floor(n / 26);
  }
  return (
    parts.find((x) => x.type === "month").value +
    parts.find((x) => x.type === "day").value +
    suffix
  );
}
export function handler({
  getStore = cloudStore,
  env = process.env,
  generateAI = generate,
} = {}) {
  return async function (request, context = {}) {
    try {
      const url = new URL(request.url),
        path = url.pathname
          .replace(/^\/(?:api|\.netlify\/functions\/api)\/?/, "")
          .split("/")
          .filter(Boolean);
      const store = getStore(),
        method = request.method;
      fail(["GET", "POST"].includes(method), "Method not allowed", 405);
      let body = {};
      if (method === "POST") {
        const origin = request.headers.get("origin");
        fail(!origin || origin === url.origin, "Invalid origin", 403);
        const raw = await request.text();
        fail(raw.length <= 100000, "Request too large", 413);
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          fail(false, "Invalid JSON");
        }
        fail(
          body && typeof body === "object" && !Array.isArray(body),
          "Invalid body",
        );
      }
      if (path[0] === "health")
        return json({
          ok: true,
          storage: "Netlify Blobs",
          analysis: "local-only",
          local_worker: 1,
        });
      if (path[0] === "login" && method === "POST") {
        fail(
          env.VCU_ADMIN_PASSWORD,
          "Set VCU_ADMIN_PASSWORD in Netlify environment variables",
          503,
        );
        const ip = context.ip || "unknown",
          bucket = Math.floor(Date.now() / 600000);
        const key =
          "login/" +
          createHash("sha256")
            .update(ip + bucket)
            .digest("hex");
        await update(store, key, (old) => {
          const v = old || { count: 0 };
          fail(v.count < 10, "Too many login attempts. Wait 10 minutes.", 429);
          v.count++;
          return { write: true, value: v };
        });
        fail(
          equal(body.password || "", env.VCU_ADMIN_PASSWORD),
          "비밀번호를 확인해 주세요. / Incorrect password.",
          401,
        );
        return json({ token: issue({ role: "admin" }, env) });
      }
      if (path[0] === "workshops" && path.length === 1) {
        authenticate(request, env, null, ["admin"]);
        if (method === "GET") {
          const list = await store.list({ prefix: "rooms/" });
          const rooms = await Promise.all(
            list.blobs.map(async (b) => {
              const w = await store.get(b.key, { type: "json" });
              return (
                w && { id: w.code, name: w.name, demo: w.demo, tool: "duo" }
              );
            }),
          );
          return json(rooms.filter(Boolean).reverse());
        }
        for (let i = 0; i < 1000; i++) {
          const code = dateCode(i),
            w = create(code, body),
            saved = await store.setJSON("rooms/" + code, w, {
              onlyIfNew: true,
            });
          if (saved.modified) return json({ id: code });
        }
        fail(false, "Workshop limit reached", 409);
      }
      fail(
        ["workshops", "rooms"].includes(path[0]) && path[1],
        "Not found",
        404,
      );
      const code = path[1].toLowerCase(),
        action = path[2] || "",
        key = "rooms/" + code;
      fail(/^\d{4}[a-z]+$/.test(code), "Invalid workshop code", 404);
      if (path[0] === "rooms" && action === "qr" && method === "GET") {
        fail(await store.get(key), "Workshop not found", 404);
        const base = env.URL || url.origin;
        return new Response(
          await QRCode.toString(base + "/?room=" + code, {
            type: "svg",
            margin: 2,
          }),
          {
            headers: {
              "Content-Type": "image/svg+xml",
              "Cache-Control": "public,max-age=300",
            },
          },
        );
      }
      const a =
        action === "join" && method === "POST"
          ? { role: "guest" }
          : authenticate(request, env, code);
      if (path[0] === "rooms" && action === "screen" && method === "POST") {
        fail(a.role === "admin", "Facilitator access required", 403);
        fail(await store.get(key), "Workshop not found", 404);
        return json({ token: issue({ role: "screen", room: code }, env) });
      }
      fail(path[0] === "workshops", "Not found", 404);
      // Persist expiration before validating mutations, including rejected late saves.
      await update(store, key, (w) => {
        fail(w, "Workshop not found", 404);
        let changed = expire(w);
        if (method === 'GET' && !action && a.role === 'participant') {
          const person = w.participant.find(p => p.id === a.participant);
          if (person && Date.now()/1000 - (person.last_seen || 0) > 20) {
            person.last_seen = Date.now()/1000; changed = true;
          }
        }
        return { write: changed };
      });
      if (method === "GET") {
        const w = await store.get(key, { type: "json" });
        if (action === "export") {
          fail(a.role === "admin", "Facilitator access required", 403);
          if (url.searchParams.get("format") === "csv")
            return new Response(csv(w), {
              headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Cache-Control": "no-store",
              },
            });
          return json(exported(w));
        }
        fail(!action, "Not found", 404);
        return json(publicState(w, a, env));
      }
      const result = await update(store, key, (w) => {
        expire(w);
        const result =
          action === "worker"
            ? worker(w, body, a)
            : mutate(w, action, body, a, env);
        return { write: true, result };
      });
      if (action === "join")
        return json({
          token: issue(
            { role: "participant", room: code, participant: result.id },
            env,
          ),
          pid: result.pid,
        });
      if (action === "chat") {
        if (result.run.provider === "ollama") return json(result.run);
        if (result.created) {
          const run = result.run;
          const save = async (g, fields) =>
            update(store, key, (w) => {
              const c = w.duo_chat.find((c) => c.id === run.id);
              if (c.status !== "running") return { write: false };
              Object.assign(c.answers[g], fields);
              return { write: true };
            });
          await Promise.all(
            groups.map(async (g) => {
              try {
                const answer = await generateAI(
                  run.prompts[g],
                  run.question,
                  run.model,
                  env,
                  (text) => save(g, { text, status: "streaming" }),
                );
                await save(g, answer);
              } catch (error) {
                await save(g, {
                  status: "failed",
                  error:
                    error.publicMessage ||
                    (["TimeoutError", "AbortError"].includes(error.name)
                      ? "AI 응답 시간 초과입니다. / AI request timed out."
                      : "AI 연결 또는 응답 처리에 실패했습니다. / AI connection or response processing failed."),
                });
              }
            }),
          );
          await update(store, key, (w) => {
            const c = w.duo_chat.find((c) => c.id === run.id);
            c.status = Object.values(c.answers).every(
              (a) => a.status === "complete",
            )
              ? "complete"
              : "failed";
            c.finished_at = new Date().toISOString();
            return { write: true };
          });
        }
        return json(
          (await store.get(key, { type: "json" })).duo_chat.find(
            (c) => c.id === result.run.id,
          ),
        );
      }
      return json(result);
    } catch (e) {
      return json(
        {
          detail: e.status
            ? e.message
            : "서버 연결 오류입니다. 다시 시도해 주세요. / Server error. Please retry.",
        },
        e.status || 500,
      );
    }
  };
}
export default handler();
