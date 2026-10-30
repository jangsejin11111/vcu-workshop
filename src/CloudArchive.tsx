import React, { useEffect, useState } from "react";
import "./jam.css";
export default function CloudArchive() {
  const [lang, L] = useState(localStorage.getItem("jam-lang") || "ko");
  const t = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [token, T] = useState(localStorage.getItem("jam-admin-token") || "");
  const [password, P] = useState(""),
    [error, E] = useState(""),
    [rooms, R] = useState<any[]>([]),
    [busy, B] = useState(false);
  async function api(path: string, body?: any, tk = token) {
    const r = await fetch("/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + tk,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.detail);
    return d;
  }
  async function act(fn: () => Promise<void>) {
    B(true);
    E("");
    try {
      await fn();
    } catch (e: any) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  useEffect(() => {
    if (token) act(async () => R(await api("/workshops")));
  }, [token]);
  async function download(code: string, format: string) {
    const r = await fetch(`/api/workshops/${code}/export?format=${format}`, {
      headers: { Authorization: "Bearer " + token },
    });
    if (!r.ok) throw Error((await r.json()).detail);
    const url = URL.createObjectURL(await r.blob()),
      a = document.createElement("a");
    a.href = url;
    a.download = `${code}-workshop.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="jam">
      <header>
        <a href="/">
          SAME WORDS
          <br />
          <b>RESULTS ARCHIVE</b>
        </a>
        <button onClick={() => L(lang === "ko" ? "en" : "ko")}>
          {lang === "ko" ? "EN" : "한국어"}
        </button>
      </header>
      <main>
        <h1>{t("토론 기록", "Discussion archive")}</h1>
        {error && (
          <div role="alert" className="j-error">
            {error}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              const d = await api("/login", { password });
              localStorage.setItem("jam-admin-token", d.token);
              T(d.token);
              P("");
              R(await api("/workshops", undefined, d.token));
            });
          }}
        >
          <label>
            {t("진행자 비밀번호", "Facilitator password")}
            <input
              type="password"
              value={password}
              onChange={(e) => P(e.target.value)}
            />
          </label>
          <button disabled={busy || !password}>{t("로그인", "Sign in")}</button>
        </form>
        {rooms.map((r) => (
          <section className="j-note" key={r.id}>
            <h2>
              {r.id} · {r.name}
            </h2>
            <a href={"/?room=" + r.id}>
              {t("회차별 공유보드 열기", "Open round boards")} →
            </a>
            <div>
              <button
                disabled={busy}
                onClick={() => act(() => download(r.id, "json"))}
              >
                JSON ↓
              </button>
              <button
                disabled={busy}
                onClick={() => act(() => download(r.id, "csv"))}
              >
                CSV ↓
              </button>
            </div>
          </section>
        ))}
        <section className="j-note">
          <h2>
            {t(
              "Sentence-BERT · 내 컴퓨터에서",
              "Sentence-BERT · on your computer",
            )}
          </h2>
          <p>
            {t(
              "JSON은 모든 수정 이력·결론·페르소나·AI 답변을 보존합니다. CSV에는 각 사람의 회차별 최종 응답이 담깁니다.",
              "JSON preserves all revisions, notes, personas and AI responses. CSV contains the latest response per participant and round.",
            )}
          </p>
          <p>
            {t(
              "JSON 다운로드 후 프로젝트 폴더에서 실행하세요.",
              "After downloading JSON, run this in the project folder.",
            )}
          </p>
          <pre>
            python scripts/analyze_export.py my-workshop.json --field meaning
            --output analysis.json
          </pre>
          <p>
            {t(
              "해석·대답·행동·감정은 각각 분석합니다. 모델 추천은 자동 분류가 아니며, 결과 확인은 사람이 합니다.",
              "Analyze interpretation, reply, action and emotion separately. Similarities are suggestions for human review.",
            )}
          </p>
        </section>
      </main>
    </div>
  );
}
