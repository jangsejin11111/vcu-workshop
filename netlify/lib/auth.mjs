import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
export function fail(condition, message, status = 422) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
export function equal(a, b) {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
function signature(text, env) {
  fail(
    env.VCU_AUTH_SECRET?.length >= 32,
    "Set VCU_AUTH_SECRET (32+ characters) in Netlify environment variables.",
    503,
  );
  return createHmac("sha256", env.VCU_AUTH_SECRET)
    .update(text)
    .digest("base64url");
}
export function issue(data, env) {
  const payload = Buffer.from(
    JSON.stringify({
      ...data,
      id: randomUUID(),
      exp: Date.now() + 7 * 86400000,
      credential:
        data.role === "admin"
          ? signature(env.VCU_ADMIN_PASSWORD || "", env)
          : undefined,
    }),
  ).toString("base64url");
  return payload + "." + signature(payload, env);
}
export function authenticate(request, env, room, roles) {
  const token = (request.headers.get("authorization") || "").replace(
    /^Bearer /,
    "",
  );
  const [payload, sig] = token.split(".");
  fail(
    payload && sig && equal(sig, signature(payload, env)),
    "다시 로그인해 주세요. / Please sign in again.",
    401,
  );
  let a;
  try {
    a = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    fail(false, "Invalid session", 401);
  }
  fail(a.exp > Date.now(), "Session expired", 401);
  if (a.role === "admin")
    fail(
      equal(a.credential, signature(env.VCU_ADMIN_PASSWORD || "", env)),
      "Please sign in again",
      401,
    );
  else fail(room && a.room === room, "Wrong workshop", 403);
  fail(!roles || roles.includes(a.role), "Facilitator access required", 403);
  return a;
}
