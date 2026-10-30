import React, { useState, useEffect } from "react";
import "./jam.css";
type D = Record<string, any>;
export default function Archive() {
  const [lang, L] = useState(localStorage.getItem("jam-lang") || "ko");
  const t = (a: string, b: string) => (lang === "ko" ? a : b);
  const [token, T] = useState(localStorage.getItem("jam-admin-token") || ""),
    [password, P] = useState(""),
    [data, S] = useState<D | null>(null),
    [selected, Select] = useState<string[]>(
      new URLSearchParams(location.search).get("room")
        ? [new URLSearchParams(location.search).get("room")!]
        : [],
    ),
    [detail, Detail] = useState<D | null>(null),
    [run, R] = useState<D | null>(null),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [field, F] = useState("meaning"),
    [phase, Phase] = useState(
      new URLSearchParams(location.search).get("phase") === "discussion"
        ? "discussion"
        : "initial",
    ),
    [card, C] = useState(""),
    [demo, Demo] = useState(false),
    [reason, Reason] = useState<Record<string, string>>({});
  async function api(path: string, body?: D, tk = token) {
    const r = await fetch("/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + tk,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.detail || "Request failed");
    return d;
  }
  async function load() {
    if (token) S(await api("/archive"));
  }
  async function act(fn: () => Promise<any>) {
    B(true);
    E("");
    try {
      await fn();
      await load();
    } catch (e: any) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  useEffect(() => {
    if (!token) return;
    load().catch((e) => E(e.message));
    const timer = setInterval(() => {
      load().catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [token]);
  useEffect(() => {
    if (run?.status !== "running") return;
    const timer = setInterval(
      () =>
        api("/archive/runs/" + run.id)
          .then(R)
          .catch((e) => E(e.message)),
      2000,
    );
    return () => clearInterval(timer);
  }, [run?.id, run?.status]);
  async function download(code: string, format: string) {
    const r = await fetch(
      "/api/archive/rooms/" + code + "/export?format=" + format,
      { headers: { Authorization: "Bearer " + token } },
    );
    if (!r.ok) throw Error("Download failed");
    const u = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = u;
    a.download = code + "-jam." + format;
    a.click();
    URL.revokeObjectURL(u);
  }
  const labels: D = {
    meaning: t("해석", "Interpretation"),
    reply: t("대답", "Reply"),
    action: t("행동", "Action"),
    emotion: t("감정", "Emotion"),
  };
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
        <div className="j-eyebrow">COLLECT NOW · REFLECT LATER</div>
        <h1>
          {t(
            "우리의 생각을\n모아두는 곳",
            "A place for\nour collected thoughts",
          )}
        </h1>
        <p>
          {t(
            "응답과 토론 메모는 서버에 자동 보관됩니다. 공개가 끝난 카드만 여기서 볼 수 있어요.",
            "Responses and discussion notes are stored on the server. Only revealed cards appear here.",
          )}
        </p>
        {error && (
          <p role="alert" className="j-error">
            {error}
          </p>
        )}
        {!data ? (
          <section className="j-entry">
            <h2>{t("진행자 로그인", "Facilitator sign in")}</h2>
            <label>
              {t("비밀번호", "Password")}
              <input
                type="password"
                value={password}
                onChange={(e) => P(e.target.value)}
              />
            </label>
            <button
              disabled={busy}
              className="j-primary"
              onClick={() =>
                act(async () => {
                  const d = await api("/login", { password });
                  localStorage.setItem("jam-admin-token", d.token);
                  T(d.token);
                  S(await api("/archive", undefined, d.token));
                })
              }
            >
              {t("보관함 열기", "Open archive")}
            </button>
          </section>
        ) : (
          <>
            <label className="j-check">
              <input
                type="checkbox"
                checked={demo}
                onChange={(e) => {
                  Demo(e.target.checked);
                  Select([]);
                }}
              />
              {t("테스트 방도 표시", "Include demo rooms")}
            </label>
            <section className="j-wall">
              {data.rooms
                .filter((r: D) => demo || !r.demo)
                .map((r: D) => (
                  <article key={r.id}>
                    <label className="j-check">
                      <input
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        onChange={(e) =>
                          Select(
                            e.target.checked
                              ? [...selected, r.id]
                              : selected.filter((x) => x !== r.id),
                          )
                        }
                      />
                      <b>{r.name}</b>
                    </label>
                    <small>
                      {r.id} · {new Date(r.created_at).toLocaleDateString()} ·{" "}
                      {r.phase === "done"
                        ? t("완료", "Finished")
                        : t("진행 중", "In progress")}
                    </small>
                    <p>
                      {r.cards.length} {t("공개 카드", "revealed cards")} ·{" "}
                      {r.responses} {t("응답 기록", "response records")} ·{" "}
                      {r.notes} {t("메모", "notes")}
                    </p>
                    <button
                      onClick={() =>
                        act(async () =>
                          Detail(await api("/archive/rooms/" + r.id)),
                        )
                      }
                    >
                      {t("기록 보기", "View records")}
                    </button>{" "}
                    <button onClick={() => act(() => download(r.id, "json"))}>
                      JSON
                    </button>{" "}
                    <button onClick={() => act(() => download(r.id, "csv"))}>
                      CSV
                    </button>
                  </article>
                ))}
            </section>
            {data.rooms.filter((r: D) => demo || !r.demo).length === 0 && (
              <p>
                {t(
                  "아직 보관된 방이 없어요. 테스트 방을 보려면 위 체크를 켜 주세요.",
                  "No rooms yet. Enable demo rooms to see test sessions.",
                )}
              </p>
            )}
            {detail && (
              <section className="j-note">
                <button onClick={() => Detail(null)}>
                  {t("접기", "Close")}
                </button>
                <h2>{detail.room.name}</h2>
                {detail.cards.map((n: number) => (
                  <details key={n}>
                    <summary>
                      {t("상황", "Scene")} {n + 1} ·{" "}
                      {
                        detail.responses.find((r: D) => r.card === n)?.scene?.[
                          lang === "ko" ? 2 : 3
                        ]
                      }
                    </summary>
                    {detail.responses
                      .filter((r: D) => r.card === n)
                      .map((r: D) => (
                        <article className="a-record" key={r.id}>
                          <small>
                            {r.pid} · {r.group} ·{" "}
                            {r.phase === "initial"
                              ? t("최초 응답", "First response")
                              : t("토론 뒤 응답", "After discussion")}{" "}
                            · {new Date(r.created_at).toLocaleString()}
                          </small>
                          {Object.entries(labels).map(([k, label]) => (
                            <p key={k}>
                              <b>{String(label)}:</b> {r.answers[k] || "—"}
                            </p>
                          ))}
                          <small>
                            {t(
                              "해석 선택 / 확신 / 흔함",
                              "Choice / certainty / familiarity",
                            )}
                            : {r.answers.choice || "—"} /{" "}
                            {r.answers.certainty || "—"} /{" "}
                            {r.answers.familiarity || "—"}
                          </small>
                        </article>
                      ))}
                    {detail.notes
                      .filter((r: D) => r.card === n)
                      .map((r: D) => (
                        <blockquote key={r.id}>
                          <small>
                            {r.group} · {t("토론 메모", "Discussion note")}
                          </small>
                          <p>{r.text}</p>
                        </blockquote>
                      ))}
                  </details>
                ))}
              </section>
            )}
            <section className="j-controls">
              <p className="j-kicker">SENTENCE-BERT · LATER</p>
              <h2>{t("모아둔 응답 분석하기", "Analyze saved responses")}</h2>
              <p>
                {t(
                  "선택한 방에서 같은 상황의 응답끼리 비교합니다. 해석·대답·행동·감정을 섞지 않으며, 토론 뒤 응답은 각 참가자의 마지막 버전을 사용합니다.",
                  "Compare responses to the same scene across selected rooms. Fields stay separate. Post-discussion analysis uses each participant’s latest version.",
                )}
              </p>
              <div className="a-filters">
                <label>
                  {t("분석할 내용", "Field")}
                  <select value={field} onChange={(e) => F(e.target.value)}>
                    {Object.entries(labels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {String(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("응답 시점", "Response phase")}
                  <select value={phase} onChange={(e) => Phase(e.target.value)}>
                    <option value="initial">
                      {t("최초 응답", "First response")}
                    </option>
                    <option value="discussion">
                      {t("토론 뒤 응답", "After discussion")}
                    </option>
                  </select>
                </label>
                <label>
                  {t("상황", "Scene")}
                  <select value={card} onChange={(e) => C(e.target.value)}>
                    <option value="">
                      {t("모든 상황 (각각 분석)", "All scenes (separately)")}
                    </option>
                    {Array.from({ length: 8 }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="j-primary"
                disabled={
                  busy ||
                  !selected.length ||
                  data.runs.some((r: D) => r.status === "running")
                }
                onClick={() =>
                  act(async () => {
                    const d = await api("/archive/analyze", {
                      rooms: selected,
                      field,
                      phase,
                      card: card === "" ? null : Number(card),
                    });
                    R(d);
                  })
                }
              >
                {t("선택한", "Analyze")} {selected.length}{" "}
                {t("개 방 분석 시작", "selected rooms")}
              </button>
              <p>
                {t(
                  "모델은 분석을 요청할 때 로딩합니다. 실패해도 기록은 남으며 다시 시도할 수 있습니다.",
                  "The model loads on request. Records remain safe if analysis fails; you can retry.",
                )}
              </p>
            </section>
            <h2>{t("분석 이력", "Analysis history")}</h2>
            {data.runs
              .slice()
              .reverse()
              .map((r: D) => (
                <button
                  className="a-run"
                  key={r.id}
                  onClick={() =>
                    act(async () => R(await api("/archive/runs/" + r.id)))
                  }
                >
                  {new Date(r.created_at).toLocaleString()} · {labels[r.field]}{" "}
                  ·{" "}
                  {r.phase === "initial"
                    ? t("최초", "Initial")
                    : t("토론 뒤", "After discussion")}{" "}
                  · {r.inputs.length} · {r.status}
                </button>
              ))}
            {run && (
              <section className="j-note">
                <h2>
                  {t("분석 결과", "Analysis result")} · {labels[run.field]}
                </h2>
                <p>
                  {run.status === "running"
                    ? t(
                        "모델을 준비하고 분석 중입니다. 창을 닫아도 서버에서 계속 진행합니다.",
                        "Loading the model and analyzing. Work continues on the server if you close this page.",
                      )
                    : run.status === "failed"
                      ? t(
                          "분석 실패. 가짜 점수는 만들지 않았습니다. 위에서 다시 실행할 수 있어요.",
                          "Analysis failed. No fabricated scores. You can start another run above.",
                        )
                      : t(
                          "유사도가 높은 최대 100쌍입니다. 같은 뜻이라는 판정은 아니며 사람이 확인합니다.",
                          "Up to 100 highest-scoring pairs. Similarity is not a verdict; review the meaning yourself.",
                        )}
                </p>
                {run.error && <p role="alert">{run.error}</p>}
                <small>
                  {run.model?.model_id} · {run.model?.revision} ·{" "}
                  {run.pair_count ?? 0} {t("전체 비교쌍", "total pairs")}
                </small>
                {Object.values(run.token_lengths || {}).some(
                  (n: any) => n > (run.model?.max_seq_length || 128),
                ) && (
                  <p>
                    {t(
                      "긴 응답 일부가 모델 토큰 한도로 잘렸습니다. 아래 원문을 함께 확인하세요.",
                      "Some responses exceeded the model token limit. Review the full originals below.",
                    )}
                  </p>
                )}
                {run.pairs.map((p: D) => {
                  const a = run.inputs.find((x: D) => x.id === p.left),
                    b = run.inputs.find((x: D) => x.id === p.right);
                  const key = p.left + p.right;
                  const review = run.reviews
                    ?.filter((x: D) => x.left === p.left && x.right === p.right)
                    .at(-1);
                  return (
                    <article className="a-record" key={key}>
                      <small>
                        {t("상황", "Scene")} {a.card + 1} · cosine{" "}
                        {p.score.toFixed(3)}
                      </small>
                      <p>
                        <b>
                          {a.room} / {a.pid}
                        </b>{" "}
                        {a.text}
                      </p>
                      <p>
                        <b>
                          {b.room} / {b.pid}
                        </b>{" "}
                        {b.text}
                      </p>
                      <label>
                        {t("사람의 검토 메모", "Human review note")}
                        <input
                          value={reason[key] || ""}
                          onChange={(e) =>
                            Reason({ ...reason, [key]: e.target.value })
                          }
                          maxLength={2000}
                        />
                      </label>
                      <div className="j-options">
                        {[
                          ["similar", t("비슷한 뜻", "Similar meaning")],
                          ["different", t("다른 뜻", "Different meaning")],
                          ["uncertain", t("판단 유보", "Uncertain")],
                        ].map(([v, label]) => (
                          <button
                            disabled={busy}
                            key={v}
                            onClick={() =>
                              act(async () => {
                                await api(
                                  "/archive/runs/" + run.id + "/review",
                                  {
                                    left: p.left,
                                    right: p.right,
                                    decision: v,
                                    reason: reason[key] || "",
                                  },
                                );
                                R(await api("/archive/runs/" + run.id));
                              })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {review && (
                        <small>
                          {t("최근 검토", "Latest review")}: {review.decision} ·{" "}
                          {review.reason}
                        </small>
                      )}
                    </article>
                  );
                })}
              </section>
            )}
          </>
        )}
      </main>
      <footer>
        <a href="/">← {t("상황카드 잼으로", "Back to card jam")}</a>
        <span>
          {t("원본 보존 · 후속 분석", "Originals preserved · analyze later")}
        </span>
      </footer>
    </div>
  );
}
