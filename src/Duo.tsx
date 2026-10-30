import React, { useState, useEffect, useRef } from "react";
import { CardReveal } from "./LiveRoom";
import "./jam.css";
import "./duo.css";
type D = Record<string, any>;
const CLOUD = import.meta.env.VITE_CLOUD === "true";
type Api = (path: string, body?: D, token?: string) => Promise<any>;
const groupName = (g: string, lang: string) =>
  g === "KR"
    ? lang === "ko"
      ? "한국 방"
      : "Korea room"
    : lang === "ko"
      ? "미국 방"
      : "US room";
export default function Duo() {
  const [lang, L] = useState(localStorage.getItem("jam-lang") || "ko");
  const t = (a: string, b: string) => (lang === "ko" ? a : b);
  const [code, C] = useState(
    new URLSearchParams(location.search).get("room") ||
      localStorage.getItem("duo-room") ||
      "",
  );
  const screen = new URLSearchParams(location.search).has("screen");
  const [token, T] = useState(
    (screen
      ? sessionStorage.getItem("duo-screen-" + code)
      : localStorage.getItem("duo-token-" + code)) || "",
  );
  const [state, S] = useState<D | null>(null),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [admin, A] = useState(false),
    [password, P] = useState(""),
    [group, G] = useState("KR"),
    [consent, Consent] = useState(false),
    [minutes, Minutes] = useState(5),
    [selectedCard, SelectCard] = useState(""),
    [selectedRound, SelectRound] = useState(""),
    [question, Q] = useState(""),
    [key, K] = useState(""),
    [showSetup, Setup] = useState(false),
    [time, Time] = useState(Date.now()),
    [rooms, Rooms] = useState<D[]>([]);
  const offset = useRef(0),
    pending = useRef<{ question: string; id: string } | null>(null);
  const root = "/workshops/" + code;
  const api: Api = async (path, body, tk = token) => {
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
  };
  async function refresh() {
    if (token && code) {
      const d = await api(root);
      offset.current = d.server_time * 1000 - Date.now();
      S(d);
    }
  }
  async function act(fn: () => Promise<any>) {
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
  async function command(body: D) {
    await api(root + "/control", body);
    await refresh();
  }
  function enter(tk: string, c = code) {
    localStorage.setItem("duo-token-" + c, tk);
    localStorage.setItem("duo-room", c);
    T(tk);
    C(c);
    const u = new URL(location.href);
    u.searchParams.set("room", c);
    history.replaceState(null, "", u);
  }
  useEffect(() => {
    if (!token || !code) return;
    refresh().catch((e) => E(e.message));
    let polling = false;
    const id = setInterval(
      async () => {
        if (polling || document.hidden) return;
        polling = true;
        try {
          await refresh();
        } catch {
        } finally {
          polling = false;
        }
      },
      CLOUD ? 3000 : 1200,
    );
    return () => clearInterval(id);
  }, [token, code]);
  useEffect(() => {
    const id = setInterval(() => Time(Date.now() + offset.current), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (state?.round) SelectRound(state.round);
  }, [state?.round]);
  const current = state?.rounds.find((r: D) => r.id === state.round),
    view = state?.rounds.find((r: D) => r.id === selectedRound) || current;
  const remaining = current
    ? Math.max(0, Math.ceil((current.ends_at * 1000 - time) / 1000))
    : 0;
  const elapsed = state?.started_at
    ? Math.max(0, Math.floor((time - state.started_at * 1000) / 60000))
    : 0;
  const format = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const editable =
    state?.phase === "discussion" && remaining > 0 && view?.id === current?.id;
  async function download() {
    const d = await api(root + "/export");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = code + "-two-rooms.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function login() {
    const d = await api("/login", { password });
    localStorage.setItem("jam-admin-token", d.token);
    if (code) {
      enter(d.token);
    } else {
      T(d.token);
      Rooms(await api("/workshops", undefined, d.token));
    }
  }
  return (
    <div className="jam duo">
      <header>
        <a href="/">
          SAME WORDS
          <br />
          <b>TWO PERSPECTIVES</b>
        </a>
        <div>
          <button
            onClick={() => {
              const n = lang === "ko" ? "en" : "ko";
              L(n);
              localStorage.setItem("jam-lang", n);
            }}
          >
            {lang === "ko" ? "EN" : "한국어"}
          </button>
          {state && (
            <button
              onClick={() => {
                T("");
                S(null);
                localStorage.removeItem("duo-token-" + code);
              }}
            >
              {t("나가기", "Exit")}
            </button>
          )}
        </div>
      </header>
      <main>
        {error && (
          <div className="j-error" role="alert">
            {error}
            <button onClick={() => E("")}>×</button>
          </div>
        )}
        {!state ? (
          <section className="duo-entry">
            <p className="j-kicker">DAY 01 · KOREA + US</p>
            <h1>
              {t("같은 말.\n두 개의 시선.", "Same words.\nTwo perspectives.")}
            </h1>
            <label>
              {t("워크숍 코드", "Workshop code")}
              <input
                value={code}
                maxLength={10}
                onChange={(e) => {
                  C(e.target.value.trim().toLowerCase());
                  T("");
                }}
              />
            </label>
            {!admin ? (
              <>
                <div className="room-choice">
                  {["KR", "US"].map((g) => (
                    <button
                      key={g}
                      className={group === g ? "selected" : ""}
                      onClick={() => G(g)}
                    >
                      <span>{g === "KR" ? "●" : "◆"}</span>
                      <b>{groupName(g, lang)}</b>
                    </button>
                  ))}
                </div>
                <label className="j-check">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => Consent(e.target.checked)}
                  />
                  {t(
                    "내 작성 내용이 같은 방과 진행자에게 실시간 공개되고, 개별 답변과 확정된 조별 결론이 진행자의 AI 페르소나 응답 생성에 사용되는 데 동의해요.",
                    "I agree to share my writing live with my room and facilitator, and use my individual responses and confirmed group notes for the facilitator’s AI personas.",
                  )}
                </label>
                <button
                  className="j-primary"
                  disabled={busy || !code || !consent}
                  onClick={() =>
                    act(async () => {
                      const d = await api(root + "/join", {
                        group,
                        language: lang,
                        consent,
                      });
                      enter(d.token);
                    })
                  }
                >
                  {t("입장", "Join")} →
                </button>
                <button onClick={() => A(true)}>
                  {t("진행자", "Facilitator")}
                </button>
              </>
            ) : (
              <>
                <label>
                  {t("진행자 비밀번호", "Facilitator password")}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => P(e.target.value)}
                  />
                </label>
                <button
                  className="j-primary"
                  disabled={busy}
                  onClick={() => act(login)}
                >
                  {t("로그인", "Sign in")}
                </button>
                {token && (
                  <>
                    <button
                      onClick={() =>
                        act(async () => {
                          const r = await api("/workshops", {
                            name: "Same words · Korea + US",
                          });
                          enter(token, r.id);
                        })
                      }
                    >
                      {t("새 워크숍 만들기", "Create workshop")}
                    </button>
                    {rooms.map((r) => (
                      <button key={r.id} onClick={() => enter(token, r.id)}>
                        {r.name} · {r.id}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </section>
        ) : (
          <>
            <div className="duo-topline">
              <b>
                {state.role === "admin"
                  ? t("진행자 · 두 방 동시 진행", "Facilitator · both rooms")
                  : state.group
                    ? groupName(state.group, lang)
                    : t("공용 스크린", "Shared screen")}{" "}
                · {code}
              </b>
              <span>{elapsed} / 90 MIN</span>
            </div>
            <div className="duo-steps">
              <b
                className={
                  ["lobby", "discussion", "round_closed"].includes(state.phase)
                    ? "active"
                    : ""
                }
              >
                01 {t("카드와 토론", "Cards & discussion")}
              </b>
              <b className={state.phase === "prepare" ? "active" : ""}>
                02 {t("조별 결론", "Group notes")}
              </b>
              <b className={state.phase === "compare" ? "active" : ""}>
                03 {t("두 AI 비교", "Compare two AIs")}
              </b>
            </div>
            {state.role === "admin" && !screen && (
              <section className="duo-controls">
                {!state.started_at && (
                  <button
                    onClick={() => act(() => command({ action: "start" }))}
                  >
                    {t("워크숍 시계 시작", "Start workshop clock")}
                  </button>
                )}
                {["lobby", "round_closed"].includes(state.phase) && (
                  <>
                    <select
                      aria-label="Card"
                      value={selectedCard}
                      onChange={(e) => SelectCard(e.target.value)}
                    >
                      <option value="">
                        {t("무작위 상황카드", "Random scene")}
                      </option>
                      {Array.from(
                        { length: 8 },
                        (_, i) =>
                          !state.drawn.includes(i) && (
                            <option key={i} value={i}>
                              {t("상황", "Scene")} {i + 1}
                            </option>
                          ),
                      )}
                    </select>
                    <select
                      aria-label="Minutes"
                      value={minutes}
                      onChange={(e) => Minutes(Number(e.target.value))}
                    >
                      {[3, 5, 7, 10].map((n) => (
                        <option key={n} value={n}>
                          {n} {t("분", "min")}
                        </option>
                      ))}
                    </select>
                    <button
                      className="j-primary"
                      disabled={busy || state.drawn.length === 8}
                      onClick={() =>
                        act(() =>
                          command({
                            action: "draw",
                            minutes,
                            card:
                              selectedCard === "" ? null : Number(selectedCard),
                          }),
                        )
                      }
                    >
                      {t("양쪽에 카드 공개", "Draw for both rooms")} ↗
                    </button>
                  </>
                )}
                {state.phase === "discussion" && (
                  <>
                    <button
                      onClick={() => act(() => command({ action: "extend" }))}
                    >
                      +1 MIN
                    </button>
                    <button
                      onClick={() => act(() => command({ action: "close" }))}
                    >
                      {t("토론 종료", "Close round")}
                    </button>
                  </>
                )}
                {["discussion", "round_closed", "prepare", "compare"].includes(
                  state.phase,
                ) && (
                  <button
                    onClick={() => act(() => command({ action: "prepare" }))}
                  >
                    {t("결론 확인 · AI 준비", "Review notes · prepare AI")}
                  </button>
                )}
                <button
                  onClick={() =>
                    act(async () => {
                      const d = await api("/rooms/" + code + "/screen", {});
                      window.open(
                        "/?room=" + code + "&screen=1#duotoken=" + d.token,
                        "_blank",
                        "noopener",
                      );
                    })
                  }
                >
                  {t("공용 화면", "Shared screen")}
                </button>
                <button onClick={() => act(download)}>JSON ↓</button>
                <button onClick={() => Setup(!showSetup)}>
                  {state.llm.configured
                    ? t("AI 연결됨", "AI connected")
                    : t("AI 연결 설정", "Connect AI")}
                </button>
              </section>
            )}
            {showSetup && state.role === "admin" && (
              <section className="j-note">
                <h2>
                  {state.llm.local
                    ? t("내 컴퓨터의 AI", "Local AI")
                    : "OpenAI API"}
                </h2>
                <p>
                  {state.llm.model} ·{" "}
                  {state.llm.configured
                    ? t("연결 설정됨", "Configured")
                    : state.llm.local
                      ? t("연결 프로그램 실행 필요", "Start local worker")
                      : t("키 필요", "API key needed")}
                </p>
                {state.llm.local ? (
                  <div>
                    <p>
                      {t(
                        "이 컴퓨터에서 아래 명령을 실행하고 켜두세요. 참가자는 지금 웹 주소를 그대로 사용합니다.",
                        "Run the command on the facilitator computer and keep it running. Participants keep using this website.",
                      )}
                    </p>
                    <pre>{`powershell -File scripts/start-local-ai.ps1 -Room ${code}`}</pre>
                    <p>
                      {t(
                        "API 키·크레딧이 필요하지 않습니다. 컴퓨터가 꺼지거나 연결이 끊기면 AI 답변이 중단됩니다.",
                        "No API key or credits required. AI replies stop if the computer disconnects.",
                      )}
                    </p>
                  </div>
                ) : CLOUD ? (
                  <p>
                    {t(
                      "Netlify → Project configuration → Environment variables에서 OPENAI_API_KEY를 설정한 뒤 다시 배포하세요. API 사용료는 별도입니다.",
                      "Set OPENAI_API_KEY in Netlify → Project configuration → Environment variables, then redeploy. API usage is billed separately.",
                    )}
                  </p>
                ) : (
                  <>
                    <label>
                      API key
                      <input
                        type="password"
                        autoComplete="off"
                        value={key}
                        onChange={(e) => K(e.target.value)}
                        placeholder="sk-…"
                      />
                    </label>
                    <button
                      disabled={busy || !key}
                      onClick={() =>
                        act(async () => {
                          await api("/workshops/settings/openai", { key });
                          K("");
                          await refresh();
                        })
                      }
                    >
                      {t("키 연결 확인", "Verify connection")}
                    </button>
                    <small>
                      {t(
                        "진행자 컴퓨터의 localhost에서 설정하세요. 키는 이 서버 실행 동안 메모리에만 보관됩니다.",
                        "Set on localhost on the facilitator computer. The key stays in memory until the server stops.",
                      )}
                    </small>
                  </>
                )}
              </section>
            )}
            {elapsed >= 90 &&
              state.phase !== "compare" &&
              state.phase !== "done" && (
                <div className="j-success">
                  {t(
                    "90분 경과 · 결론을 확인하고 두 AI 비교를 시작하세요.",
                    "90 minutes elapsed · finalize notes and compare the two AIs.",
                  )}
                </div>
              )}
            {state.phase === "lobby" && (
              <section className="duo-lobby">
                <h1>{t("두 방, 같은 카드.", "Two rooms. Same card.")}</h1>
                <div className="duo-columns">
                  {(state.group ? [state.group] : ["KR", "US"]).map((g) => (
                    <section className={"room-panel " + g} key={g}>
                      <h2>{groupName(g, lang)}</h2>
                      <Roster
                        people={state.participants.filter(
                          (p: D) => p.group === g,
                        )}
                      />
                    </section>
                  ))}
                </div>
                <img
                  className="j-qr"
                  src={"/api/rooms/" + code + "/qr"}
                  alt="Join QR"
                />
                <p>
                  {t(
                    "진행자가 카드를 열면 시작합니다.",
                    "Starts when the facilitator reveals a card.",
                  )}
                </p>
              </section>
            )}
            {["discussion", "round_closed"].includes(state.phase) &&
              current && (
                <>
                  <CardReveal
                    lang={lang}
                    s={{
                      id: code,
                      drawn_at: current.started_at,
                      card_data: current.scene,
                      drawn: state.drawn,
                    }}
                  />
                  <article className="duo-scene">
                    <div>
                      <small>ROUND {current.number}</small>
                      <p>{current.scene[lang === "ko" ? 0 : 1]}</p>
                      <h1>“{current.scene[lang === "ko" ? 2 : 3]}”</h1>
                    </div>
                    <div
                      className={
                        "duo-clock " + (remaining < 30 ? "urgent" : "")
                      }
                    >
                      <strong>
                        {state.phase === "round_closed"
                          ? "00:00"
                          : format(remaining)}
                      </strong>
                      <span>
                        {state.phase === "round_closed"
                          ? t("토론 종료", "Round closed")
                          : t(
                              "함께 쓰고 이야기해요",
                              "Write & discuss together",
                            )}
                      </span>
                    </div>
                  </article>
                  <div className="board-tabs">
                    {state.rounds.map((r: D) => (
                      <button
                        key={r.id}
                        className={view?.id === r.id ? "selected" : ""}
                        onClick={() => SelectRound(r.id)}
                      >
                        ROUND {r.number}
                        <strong>{r.scene[lang === "ko" ? 2 : 3]}</strong>
                      </button>
                    ))}
                  </div>
                  <div
                    className={
                      state.group ? "duo-columns single" : "duo-columns"
                    }
                  >
                    {(state.group ? [state.group] : ["KR", "US"]).map((g) => (
                      <section className={"room-panel " + g} key={g}>
                        <div className="room-heading">
                          <h2>{groupName(g, lang)}</h2>
                          <span>
                            {
                              state.participants.filter((p: D) => p.group === g)
                                .length
                            }
                          </span>
                        </div>
                        <Roster
                          people={state.participants.filter(
                            (p: D) => p.group === g,
                          )}
                        />
                        {state.group === g && view && (
                          <LiveEditor
                            key={view.id + state.participant}
                            round={view.id}
                            record={state.edits.find(
                              (e: D) =>
                                e.round === view.id &&
                                e.participant === state.participant,
                            )}
                            active={editable}
                            api={api}
                            root={root}
                            lang={lang}
                            t={t}
                          />
                        )}
                        <div className="duo-stickies">
                          {state.edits
                            .filter(
                              (e: D) => e.round === view?.id && e.group === g,
                            )
                            .map((e: D) => (
                              <article
                                key={e.participant}
                                className="duo-sticky"
                              >
                                <small>
                                  {e.pid} ·{" "}
                                  {e.participant === state.participant
                                    ? t("나", "Me")
                                    : t("실시간", "Live")}
                                </small>
                                <small>
                                  {(
                                    {
                                      literal: t("말 그대로", "Literal"),
                                      other: t("다른 뜻", "Something else"),
                                      both: t("둘 다 가능", "Could be either"),
                                      unsure: t("모르겠다", "Not sure"),
                                    } as D
                                  )[e.answers.choice] || "—"}
                                </small>
                                <h3>{e.answers.meaning || "…"}</h3>
                                <small>
                                  {t("확신", "Certainty")}{" "}
                                  {e.answers.certainty || "—"}/5 ·{" "}
                                  {t("흔함", "Frequency")}{" "}
                                  {e.answers.familiarity || "—"}/5
                                </small>
                                <p>
                                  <b>{t("대답", "Say")}</b>{" "}
                                  {e.answers.reply || "—"}
                                </p>
                                <p>
                                  <b>{t("행동", "Do")}</b>{" "}
                                  {e.answers.action || "—"}
                                </p>
                                {e.answers.emotion && (
                                  <p>
                                    <b>{t("감정", "Feel")}</b>{" "}
                                    {e.answers.emotion}
                                  </p>
                                )}
                              </article>
                            ))}
                        </div>
                        {view && (
                          <Conclusion
                            key={view.id + g}
                            round={view.id}
                            group={g}
                            record={state.conclusions.find(
                              (n: D) => n.round === view.id && n.group === g,
                            )}
                            active={
                              state.role === "admin" ||
                              (state.role === "participant" && editable)
                            }
                            admin={state.role === "admin"}
                            api={api}
                            root={root}
                            t={t}
                            refresh={refresh}
                          />
                        )}
                        <details className="duo-bert">
                          <summary>
                            Sentence-BERT · {t("저장된 분석", "Saved analysis")}
                          </summary>
                          {(state.analyses || []).flatMap((run: D) =>
                            run.pairs
                              .filter(
                                (p: D) =>
                                  p.card === view?.card &&
                                  p.left_pid.startsWith(
                                    g === "KR" ? "K" : "U",
                                  ) &&
                                  p.right_pid.startsWith(
                                    g === "KR" ? "K" : "U",
                                  ),
                              )
                              .map((p: D) => (
                                <article key={run.id + p.left + p.right}>
                                  <small>
                                    {run.field} · {p.score.toFixed(3)}
                                  </small>
                                  <p>
                                    {p.left_pid}: {p.left_text}
                                  </p>
                                  <p>
                                    {p.right_pid}: {p.right_text}
                                  </p>
                                </article>
                              )),
                          )}
                          {state.role === "admin" && (
                            <a
                              href={
                                "/?archive=1&room=" + code + "&phase=discussion"
                              }
                            >
                              {t(
                                "분석 보관함 열기 →",
                                "Open analysis archive →",
                              )}
                            </a>
                          )}
                        </details>
                      </section>
                    ))}
                  </div>
                </>
              )}
            {state.phase === "prepare" && (
              <section>
                <h1>
                  {t(
                    "우리 조의 결론을\n경에게 건네요.",
                    "Give Kyung\nyour group’s notes.",
                  )}
                </h1>
                <p>
                  {t(
                    "각 조의 영어 결론과 개인별 답변을 구분해 함께 반영합니다.",
                    "One shared template, with confirmed English notes and separate individual responses from each group.",
                  )}
                </p>
                {state.rounds.map((r: D) => (
                  <section key={r.id}>
                    <h2>
                      ROUND {r.number} · {r.scene[lang === "ko" ? 2 : 3]}
                    </h2>
                    <div className="duo-columns">
                      {(state.group ? [state.group] : ["KR", "US"]).map((g) => (
                        <section className={"room-panel " + g} key={g}>
                          <h3>{groupName(g, lang)}</h3>
                          <Conclusion
                            round={r.id}
                            group={g}
                            record={state.conclusions.find(
                              (n: D) => n.round === r.id && n.group === g,
                            )}
                            active={state.role === "admin"}
                            admin={state.role === "admin"}
                            api={api}
                            root={root}
                            t={t}
                            refresh={refresh}
                          />
                        </section>
                      ))}
                    </div>
                  </section>
                ))}
                {state.role === "admin" && (
                  <button
                    className="j-primary"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await api(root + "/personas", {});
                        await refresh();
                      })
                    }
                  >
                    {t(
                      "두 페르소나 확정 · 비교 시작",
                      "Finalize personas · start comparison",
                    )}{" "}
                    →
                  </button>
                )}
              </section>
            )}
            {["compare", "done"].includes(state.phase) && (
              <section className="duo-chat">
                <h1>
                  {t(
                    "같은 질문.\n두 개의 답변.",
                    "One question.\nTwo responses.",
                  )}
                </h1>
                <p>
                  {state.llm.model} ·{" "}
                  {t(
                    "같은 모델 · 조별 메모만 다르게",
                    "Same model · different group notes",
                  )}
                </p>
                {!state.llm.configured && (
                  <div className="j-error">
                    {state.llm.local
                      ? t(
                          "진행자 컴퓨터의 로컬 AI 연결을 기다리고 있어요.",
                          "Waiting for the facilitator’s local AI worker.",
                        )
                      : t(
                          "진행자 컴퓨터에서 OpenAI 키를 연결하면 실제 AI 응답이 시작됩니다.",
                          "Connect an OpenAI key on the facilitator computer to receive real AI responses.",
                        )}
                  </div>
                )}
                {state.role === "admin" && state.phase === "compare" && (
                  <>
                    <div className="j-options">
                      {[
                        "I'm fine.",
                        "It's all in the past.",
                        "Maybe next time.",
                      ].map((q) => (
                        <button key={q} onClick={() => Q(q)}>
                          {q}
                        </button>
                      ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        act(async () => {
                          if (
                            !pending.current ||
                            pending.current.question !== question
                          )
                            pending.current = {
                              question,
                              id: Array.from(
                                crypto.getRandomValues(new Uint32Array(4)),
                              ).join("-"),
                            };
                          await api(root + "/chat", {
                            question,
                            request_id: pending.current.id,
                          });
                          pending.current = null;
                          Q("");
                          await refresh();
                        });
                      }}
                    >
                      <label>
                        {t("두 AI에게 같은 질문", "Same question for both AIs")}
                        <textarea
                          rows={2}
                          maxLength={2000}
                          value={question}
                          onChange={(e) => Q(e.target.value)}
                          placeholder={t(
                            "관객의 한마디를 넣어주세요.",
                            "Enter a visitor’s line.",
                          )}
                        />
                      </label>
                      <button
                        className="j-primary"
                        disabled={
                          busy ||
                          !question.trim() ||
                          !state.llm.configured ||
                          state.chats.some((c: D) =>
                            ["queued", "running"].includes(c.status),
                          )
                        }
                      >
                        {t("동시에 질문하기", "Ask both")} ↑
                      </button>
                    </form>
                  </>
                )}
                {state.chats
                  .slice()
                  .reverse()
                  .map((c: D) => (
                    <section className="comparison" key={c.id}>
                      <div className="visitor-line">
                        <small>YOU · v{c.version}</small>
                        <h2>{c.question}</h2>
                      </div>
                      <div className="duo-columns">
                        {["KR", "US"].map((g) => (
                          <article key={g} className={"ai-answer " + g}>
                            <h3>
                              {g === "KR"
                                ? t("한국 조 페르소나", "Korea-group persona")
                                : t("미국 조 페르소나", "US-group persona")}
                            </h3>
                            <p>
                              {c.answers[g].text ||
                                (["queued", "streaming"].includes(
                                  c.answers[g].status,
                                )
                                  ? "•••"
                                  : "—")}
                            </p>
                            {c.answers[g].status === "failed" && (
                              <small role="alert">{c.answers[g].error}</small>
                            )}
                            {c.answers[g].status === "streaming" && (
                              <span className="stream-cursor">▍</span>
                            )}
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                {state.role === "admin" &&
                  state.personas.map((v: D) => (
                    <details key={v.id}>
                      <summary>
                        {t("프롬프트 버전", "Prompt version")} {v.version}
                      </summary>
                      <p>
                        {t("개별 답변 포함", "Individual responses included")}:
                        KR {v.individual_responses?.KR?.length || 0} · US{" "}
                        {v.individual_responses?.US?.length || 0}
                      </p>
                      <div className="duo-columns">
                        {["KR", "US"].map((g) => (
                          <pre key={g}>{v.prompts[g]}</pre>
                        ))}
                      </div>
                    </details>
                  ))}
              </section>
            )}
          </>
        )}
      </main>
      <footer>
        <a href={"/?archive=1&room=" + code + "&phase=discussion"}>
          {t("기록 · Sentence-BERT 보관함", "Records · Sentence-BERT archive")}
        </a>
        <span>VCU × KART / DAY 01</span>
      </footer>
    </div>
  );
}
function Roster({ people }: { people: D[] }) {
  return (
    <div className="duo-roster">
      {people.map((p: D, i: number) => (
        <span key={p.id} className={p.typing ? "writing" : ""}>
          <i>{["●", "◆", "✦", "■"][i % 4]}</i>
          {p.pid}
          {p.typing && <b className="stream-cursor"> …</b>}
        </span>
      ))}
    </div>
  );
}
function LiveEditor({
  round,
  record,
  active,
  api,
  root,
  lang,
  t,
}: {
  round: string;
  record?: D;
  active: boolean;
  api: Api;
  root: string;
  lang: string;
  t: (a: string, b: string) => string;
}) {
  const [answers, A] = useState<D>(record?.answers || {}),
    [status, Status] = useState(""),
    [error, E] = useState("");
  const values = useRef<D>(answers),
    version = useRef(record?.version || 0),
    dirty = useRef(false),
    flight = useRef(false),
    isActive = useRef(active);
  isActive.current = active;
  useEffect(() => {
    if (
      !dirty.current &&
      !flight.current &&
      record &&
      record.version > version.current
    ) {
      version.current = record.version;
      values.current = record.answers;
      A(record.answers);
    }
  }, [record?.version]);
  useEffect(() => {
    if (!active && dirty.current)
      E(
        t(
          "마감 전에 저장하지 못한 내용이 있어요. 입력창에 남겨두었습니다.",
          "Some text was not saved before the timer ended. It remains in the editor.",
        ),
      );
  }, [active]);
  async function save() {
    if (flight.current || !dirty.current || !isActive.current) return;
    flight.current = true;
    dirty.current = false;
    Status(t("저장 중…", "Saving…"));
    try {
      const result = await api(root + "/edit", {
        round,
        answers: values.current,
        base_version: version.current,
        language: lang,
      });
      version.current = result.version;
      Status(t("우리 방에 공유됨 ✓", "Shared with your room ✓"));
      E("");
    } catch (e: any) {
      dirty.current = true;
      E(e.message);
      Status("");
    } finally {
      flight.current = false;
    }
  }
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => save(), CLOUD ? 1200 : 600);
    return () => clearTimeout(timer);
  }, [answers, active]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (dirty.current && !flight.current && !error) save();
    }, 1500);
    return () => clearInterval(timer);
  }, [active, error]);
  function reset() {
    version.current = record?.version || 0;
    dirty.current = false;
    values.current = record?.answers || {};
    A(values.current);
    E("");
  }
  function change(k: string, v: string) {
    const n = { ...values.current, [k]: v };
    values.current = n;
    dirty.current = true;
    A(n);
  }
  function entry(k: string, label: string) {
    return (
      <label>
        {label}
        <textarea
          disabled={!active}
          rows={2}
          maxLength={3000}
          value={answers[k] || ""}
          onChange={(e) => change(k, e.target.value)}
          placeholder={t(
            "한 줄도 좋아요. 편하게 써주세요.",
            "One line is enough. Write what comes to mind.",
          )}
        />
      </label>
    );
  }
  function slider(
    k: string,
    num: string,
    label: string,
    low: string,
    high: string,
  ) {
    const selected = answers[k] !== undefined && answers[k] !== "";
    return (
      <fieldset className="answer-question">
        <legend>
          {num} · {label}
        </legend>
        <div className="scale-value" aria-live="polite">
          {selected
            ? answers[k] + " / 5"
            : t("아직 선택하지 않음", "Not selected")}
        </div>
        <input
          className="answer-slider"
          aria-label={label}
          aria-valuetext={
            selected
              ? answers[k] + " / 5"
              : t("아직 선택하지 않음", "Not selected")
          }
          type="range"
          min="1"
          max="5"
          step="1"
          disabled={!active}
          value={selected ? answers[k] : "3"}
          onChange={(e) => change(k, e.target.value)}
          onPointerUp={(e) => change(k, e.currentTarget.value)}
          onKeyUp={(e) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "Enter",
                " ",
              ].includes(e.key)
            )
              change(k, e.currentTarget.value);
          }}
        />
        <div className="scale-ticks">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              disabled={!active}
              aria-pressed={answers[k] === String(n)}
              key={n}
              onClick={() => change(k, String(n))}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="scale-ends">
          <span>1 · {low}</span>
          <span>5 · {high}</span>
        </div>
      </fieldset>
    );
  }
  return (
    <section className="live-editor">
      <h3>
        {t("내 생각", "My thoughts")}{" "}
        <small aria-live="polite">
          {active ? status : t("마감", "Closed")}
        </small>
      </h3>
      <fieldset className="answer-question">
        <legend>01 · {t("어느 쪽에 가까운가요?", "Which is closer?")}</legend>
        <div className="meaning-options">
          {[
            ["literal", "말 그대로다", "They mean it literally"],
            ["other", "다른 뜻이 있다", "They mean something else"],
            ["both", "둘 다 가능하다", "Could be either"],
            ["unsure", "모르겠다", "Not sure"],
          ].map(([v, ko, en], i) => (
            <label key={v} className={answers.choice === v ? "picked" : ""}>
              <input
                type="radio"
                name={"choice-" + round}
                disabled={!active}
                checked={answers.choice === v}
                onChange={() => change("choice", v)}
              />
              <b>{"ABCD"[i]}</b>
              <span>{t(ko, en)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="answer-question">
        <legend>
          02 ·{" "}
          {t(
            "이 사람이 하려는 말이나 의도는 무엇이라고 생각하나요?",
            "What do you think this person means or intends?",
          )}
        </legend>
        {entry("meaning", t("내가 생각한 의도", "My interpretation"))}
      </fieldset>
      {slider(
        "certainty",
        "03",
        t("얼마나 확신하나요?", "How sure are you?"),
        t("전혀 확신하지 않음", "Not sure at all"),
        t("매우 확신함", "Very sure"),
      )}
      <fieldset className="answer-question">
        <legend>
          04 ·{" "}
          {t(
            "이 상황에서 실제로 어떤 대답과 행동을 하겠어요?",
            "What would you actually say and do in this situation?",
          )}
        </legend>
        {entry("reply", t("내가 할 대답", "What I would say"))}
        {entry("action", t("내가 할 행동", "What I would do"))}
      </fieldset>
      {slider(
        "familiarity",
        "05",
        t(
          "이런 상황에서 이런 말이 내가 자란 곳에서 얼마나 흔히 쓰이나요?",
          "How commonly is this said in this situation where you grew up?",
        ),
        t("전혀 쓰이지 않음", "Never"),
        t("매우 흔하게 쓰임", "Very common"),
      )}
      {error && (
        <p role="alert" className="j-error">
          {error}
          <button onClick={reset}>
            {t("서버 저장본 불러오기", "Load saved version")}
          </button>
        </p>
      )}
      {active && (
        <button onClick={() => save()}>{t("지금 공유", "Share now")}</button>
      )}
    </section>
  );
}
function Conclusion({
  round,
  group,
  record,
  active,
  admin,
  api,
  root,
  t,
  refresh,
}: {
  round: string;
  group: string;
  record?: D;
  active: boolean;
  admin: boolean;
  api: Api;
  root: string;
  t: (a: string, b: string) => string;
  refresh: () => Promise<any>;
}) {
  const [original, O] = useState(record?.original || ""),
    [english, English] = useState(record?.english || ""),
    [error, E] = useState(""),
    [busy, B] = useState(false);
  const dirty = useRef(false),
    version = useRef(record?.version || 0);
  useEffect(() => {
    if (!dirty.current) {
      O(record?.original || "");
      English(record?.english || "");
      version.current = record?.version || 0;
    }
  }, [record?.version]);
  async function save(approved: boolean) {
    B(true);
    E("");
    try {
      const d = await api(root + "/conclusion", {
        round,
        group,
        original,
        english,
        approved,
        base_version: version.current,
      });
      version.current = d.version;
      dirty.current = false;
      await refresh();
    } catch (e: any) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  return (
    <section className="group-conclusion">
      <h3>
        {t("우리 조의 결론", "Our group’s conclusion")}{" "}
        {record?.approved ? "✓" : ""}
      </h3>
      <label>
        {t("결론과 예외", "Conclusion & exceptions")}
        <textarea
          disabled={!active}
          rows={3}
          value={original}
          maxLength={4000}
          onChange={(e) => {
            dirty.current = true;
            O(e.target.value);
          }}
          placeholder={t(
            "이 말은 ___로 들린다. 우리는 ___라고 답한다. 다만 ___.",
            "We take this as ___. We would respond by ___. An exception is ___.",
          )}
        />
      </label>
      <label>
        {t("AI에게 전달할 영어 메모", "English note for the AI")}
        <textarea
          disabled={!active}
          rows={3}
          value={english}
          maxLength={4000}
          onChange={(e) => {
            dirty.current = true;
            English(e.target.value);
          }}
          placeholder="In our culture, people usually take this line as ___, and they would respond by ___."
        />
      </label>
      {active && (
        <div className="j-options">
          <button disabled={busy} onClick={() => save(false)}>
            {t("메모 저장", "Save note")}
          </button>
          {admin && (
            <button
              className="j-primary"
              disabled={busy || !english.trim()}
              onClick={() => save(true)}
            >
              {t("영어 결론 확정", "Confirm English note")} ✓
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="j-error">
          {error}
          <button
            onClick={() => {
              dirty.current = false;
              version.current = record?.version || 0;
              O(record?.original || "");
              English(record?.english || "");
              E("");
            }}
          >
            {t("저장본 불러오기", "Load saved note")}
          </button>
        </p>
      )}
    </section>
  );
}

