import { RoomCast, CardReveal, SharedBoard } from "./LiveRoom";
import React, { useState, useEffect, useRef } from "react";
import "./jam.css";
type D = Record<string, any>;
export default function Jam() {
  const [lang, L] = useState(localStorage.getItem("jam-lang") || "ko");
  const t = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [code, C] = useState(
    new URLSearchParams(location.search).get("room") ||
      localStorage.getItem("jam-room") ||
      "",
  );
  const [token, T] = useState(
    (new URLSearchParams(location.search).has("screen")
      ? sessionStorage.getItem("jam-screen-" + code)
      : localStorage.getItem("jam-token-" + code)) || "",
  );
  const [s, S] = useState<D | null>(null),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [password, P] = useState(""),
    [admin, A] = useState(false),
    [consent, Consent] = useState(false),
    [group, G] = useState("Kart"),
    [step, Step] = useState(0),
    [answers, Answers] = useState<D>({}),
    [note, N] = useState(""),
    [message, M] = useState("");
  const lastTyped = useRef(0);
  const sentTyping = useRef(0);
  const touch = useRef<number | null>(null),
    dirty = useRef(false);
  const screen = new URLSearchParams(location.search).has("screen");
  async function api(path: string, body?: D, tk = token) {
    const r = await fetch("/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + tk,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.detail || "Request failed");
    return d;
  }
  const root = "/rooms/" + code;
  const refresh = async () => {
    if (token && code) S(await api(root + "/jam"));
  };
  async function run(fn: () => Promise<any>) {
    B(true);
    E("");
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  function saveToken(tk: string, c = code) {
    localStorage.setItem("jam-token-" + c, tk);
    localStorage.setItem("jam-room", c);
    T(tk);
    C(c);
  }
  useEffect(() => {
    if (!token || !code) return;
    refresh().catch((e) => E(e.message));
    const id = setInterval(() => refresh().catch(() => {}), 1800);
    return () => clearInterval(id);
  }, [token, code]);
  useEffect(() => {
    if (!s) return;
    const key = "jam-draft-" + code + "-" + s.card;
    const stored = localStorage.getItem(key);
    Answers(stored ? JSON.parse(stored) : s.draft?.answers || {});
    Step(0);
    dirty.current = false;
    N("");
    M("");
  }, [s?.card]);
  function change(k: string, v: string) {
    dirty.current = true;
    lastTyped.current = Date.now();
    if (Date.now() - sentTyping.current > 2000 && s?.phase === "answer") {
      sentTyping.current = Date.now();
      api(root + "/jam/activity", { card: s.card }).catch(() => {});
    }
    Answers((a) => {
      const n = { ...a, [k]: v };
      localStorage.setItem(
        "jam-draft-" + code + "-" + s?.card,
        JSON.stringify(n),
      );
      return n;
    });
  }
  useEffect(() => {
    if (!dirty.current || s?.phase !== "answer") return;
    const id = setTimeout(
      () =>
        api(root + "/jam/response", {
          card: s.card,
          answers,
          draft: true,
        }).catch(() => {}),
      700,
    );
    return () => clearTimeout(id);
  }, [answers]);
  useEffect(() => {
    if (s?.phase !== "answer") return;
    const timer = setInterval(() => {
      if (Date.now() - lastTyped.current < 7000)
        api(root + "/jam/activity", { card: s.card }).catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [s?.phase, s?.card]);
  const initial = s?.mine?.find((r: D) => r.phase === "initial");
  async function advance() {
    if (step < 2) {
      Step(step + 1);
      return;
    }
    await run(async () => {
      await api(root + "/jam/response", {
        card: s?.card,
        phase: "initial",
        answers,
        language: lang,
      });
      M(
        t(
          "저장했어요. 함께 이야기할 준비를 해요.",
          "Saved. Get ready to talk together.",
        ),
      );
    });
  }
  const field = (key: string, ko: string, en: string) => (
    <label className="j-field">
      {t(ko, en)}
      <textarea
        rows={2}
        maxLength={3000}
        value={answers[key] || ""}
        placeholder={t(
          "한 줄도 좋아요. 편하게 써주세요.",
          "One line is enough. Write what comes to mind.",
        )}
        onChange={(e) => change(key, e.target.value)}
      />
    </label>
  );
  const scale = (key: string, ko: string, en: string) => (
    <fieldset>
      <legend>{t(ko, en)}</legend>
      <div className="j-options">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            aria-pressed={answers[key] === String(n)}
            className={answers[key] === String(n) ? "selected" : ""}
            key={n}
            onClick={() =>
              change(key, answers[key] === String(n) ? "" : String(n))
            }
          >
            {n}
          </button>
        ))}
      </div>
      <small>
        {t(
          "1 = 전혀 / 없다 · 5 = 매우 / 흔하다",
          "1 = not at all / never · 5 = very / common",
        )}
      </small>
    </fieldset>
  );
  return (
    <div className={"jam " + (screen ? "j-screen" : "")}>
      <header>
        <a href="/">
          SAME WORDS
          <br />
          <b>DIFFERENT FEELINGS</b>
        </a>
        <button
          onClick={() => {
            const n = lang === "ko" ? "en" : "ko";
            L(n);
            localStorage.setItem("jam-lang", n);
          }}
        >
          {lang === "ko" ? "EN" : "한국어"}
        </button>
      </header>
      <main>
        <div className="j-eyebrow">
          VCU × KART / DAY 01 <span>{code && "ROOM " + code}</span>
        </div>
        {error && (
          <div role="alert" className="j-error">
            {error}
            <button
              onClick={() => {
                T("");
                S(null);
                localStorage.removeItem("jam-token-" + code);
              }}
            >
              {t("다시 로그인", "Sign in again")}
            </button>
          </div>
        )}
        {!s ? (
          <section className="j-entry">
            <p className="j-kicker">THE WORKSHOP JAM</p>
            <h1>
              {t(
                "같은 말,\n너는 어떻게 들었어?",
                "Same words.\nWhat did you hear?",
              )}
            </h1>
            <p>
              {t(
                "카드를 뽑고, 생각을 나누고, 경에게 메모를 남겨요.",
                "Draw a card. Share your reading. Leave a note for Kyung.",
              )}
            </p>
            <label>
              {t("방 코드", "Room code")}
              <input
                value={code}
                onChange={(e) => {
                  C(e.target.value.toUpperCase());
                  T("");
                }}
                maxLength={6}
              />
            </label>
            {!admin ? (
              <>
                <label>
                  {t("참여 조", "Your group")}
                  <select value={group} onChange={(e) => G(e.target.value)}>
                    <option>Kart</option>
                    <option>VCU</option>
                    <option>Other</option>
                  </select>
                </label>
                <label className="j-check">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => Consent(e.target.checked)}
                  />
                  {t(
                    "내 응답을 익명 번호로 워크숍 안에서 함께 읽는 데 동의해요.",
                    "I agree to share responses by participant number within this workshop.",
                  )}
                </label>
                <button
                  className="j-primary"
                  disabled={!consent || busy || !code}
                  onClick={() =>
                    run(async () => {
                      const d = await api(root + "/join", {
                        group,
                        language: lang,
                        classroom: true,
                        quote: false,
                      });
                      saveToken(d.token);
                    })
                  }
                >
                  {t("함께 시작하기", "Join the jam")} ↗
                </button>
                <button onClick={() => A(true)}>
                  {t("진행자 입장", "Facilitator")}
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
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const d = await api("/login", { password });
                      localStorage.setItem("jam-admin-token", d.token);
                      let c = code;
                      if (!c) {
                        const r = await api(
                          "/rooms",
                          {
                            name: "Day 1 · Same words, different feelings",
                            groups: ["Kart", "VCU", "Other"],
                          },
                          d.token,
                        );
                        c = r.id;
                      }
                      saveToken(d.token, c);
                    })
                  }
                >
                  {t("진행 시작 / 새 방 만들기", "Start / Create room")}
                </button>
              </>
            )}
            <small>
              {t(
                "같은 휴대폰과 브라우저로 돌아오면 이어서 참여할 수 있어요.",
                "Return with this phone and browser to reconnect.",
              )}
            </small>
          </section>
        ) : (
          <>
            <CardReveal s={s} lang={lang} />
            <RoomCast s={s} t={t} />
            <nav className="j-progress">
              {["DRAW", "YOUR TAKE", "REVEAL & TALK"].map((x, i) => (
                <span
                  key={x}
                  className={
                    (s.phase === "lobby" ||
                    (s.phase === "draw" &&
                      Date.now() >= (s.roulette_until || 0) * 1000)
                      ? 0
                      : s.phase === "answer"
                        ? 1
                        : 2) === i
                      ? "active"
                      : ""
                  }
                >
                  {"0" + (i + 1)} {x}
                </span>
              ))}
            </nav>
            {s.role === "admin" && !screen && (
              <section className="j-controls">
                <a
                  href="/?archive=1"
                  onClick={() => localStorage.setItem("jam-admin-token", token)}
                >
                  {t("결과 보관함 열기 →", "Open results archive →")}
                </a>
                <strong>
                  {t("진행자 데스크", "Facilitator desk")} · {s.submitted}/
                  {s.total} {t("응답", "submitted")}
                </strong>
                <p>
                  {t(
                    "룰렛 → 카드 → 응답 → 보드",
                    "Spin → Draw → Respond → Board",
                  )}
                </p>
                {["lobby", "discussion"].includes(s.phase) &&
                  s.drawn.length < 8 && (
                    <button
                      className="j-primary"
                      disabled={busy || !s.participants.length}
                      onClick={() =>
                        run(() =>
                          api(root + "/jam/control", { action: "roulette" }),
                        )
                      }
                    >
                      {t("뽑을 사람 룰렛 ↻", "Spin the roulette ↻")}
                    </button>
                  )}
                {s.phase === "answer" && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      const reason = prompt(
                        t(
                          "미제출 응답을 제외하고 공개합니다. 마감 이유:",
                          "Unsubmitted answers remain missing. Enter closure reason.",
                        ),
                        "Collection complete",
                      );
                      if (reason)
                        run(() =>
                          api(root + "/jam/control", {
                            action: "reveal",
                            reason,
                          }),
                        );
                    }}
                  >
                    {t("마감하고 함께 공개", "Close & reveal")}
                  </button>
                )}
                {s.phase === "discussion" && (
                  <>
                    <button
                      onClick={() =>
                        run(() =>
                          api(root + "/jam/control", { action: "finish" }),
                        )
                      }
                    >
                      {t("마무리하고 결과 보관", "Finish & keep results")}
                    </button>
                  </>
                )}
                <button
                  onClick={() =>
                    run(async () => {
                      const d = await api(root + "/screen", {});
                      const url = new URL(location.href);
                      url.searchParams.set("room", code);
                      url.searchParams.set("screen", "1");
                      url.hash = "jamtoken=" + d.token;
                      window.open(url, "_blank", "noopener");
                    })
                  }
                >
                  {t("공용 스크린", "Shared screen")}
                </button>
                <button
                  onClick={() =>
                    run(async () => {
                      const d = await api(root + "/jam/export");
                      const u = URL.createObjectURL(
                        new Blob([JSON.stringify(d, null, 2)], {
                          type: "application/json",
                        }),
                      );
                      const a = document.createElement("a");
                      a.href = u;
                      a.download = code + "-day1.json";
                      a.click();
                      URL.revokeObjectURL(u);
                    })
                  }
                >
                  {t("기록 다운로드", "Download records")}
                </button>
              </section>
            )}
            {["discussion", "done"].includes(s.phase) && (
              <SharedBoard s={s} lang={lang} t={t} />
            )}
            {["lobby", "draw"].includes(s.phase) ? (
              <section className="j-draw">
                <p className="j-kicker">{s.drawn.length} / 8 CARDS EXPLORED</p>
                <h1>
                  {t(
                    "어떤 말이\n우리를 기다릴까?",
                    "What words\nare waiting for us?",
                  )}
                </h1>
                <div
                  className="j-deck"
                  role="button"
                  tabIndex={0}
                  aria-label={t("카드 뽑기", "Draw card")}
                  onPointerDown={(e) => (touch.current = e.clientY)}
                  onPointerUp={(e) => {
                    if (
                      touch.current !== null &&
                      touch.current - e.clientY > 60 &&
                      (s.drawer === s.participant || s.role === "admin") &&
                      s.phase === "draw" &&
                      Date.now() >= (s.roulette_until || 0) * 1000
                    )
                      run(() => api(root + "/jam/draw", {}));
                    touch.current = null;
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      Date.now() >= (s.roulette_until || 0) * 1000 &&
                      s.phase === "draw" &&
                      (s.drawer === s.participant || s.role === "admin")
                    )
                      run(() => api(root + "/jam/draw", {}));
                  }}
                >
                  <span>↗</span>
                  <b>
                    SAME WORDS.
                    <br />
                    DIFFERENT
                    <br />
                    FEELINGS.
                  </b>
                  <small>
                    {t("위로 밀어서 한 장 뽑기", "Swipe up to draw")}
                  </small>
                </div>
                <button
                  className="j-primary"
                  disabled={
                    busy ||
                    s.phase !== "draw" ||
                    Date.now() < (s.roulette_until || 0) * 1000 ||
                    !(s.drawer === s.participant || s.role === "admin")
                  }
                  onClick={() => run(() => api(root + "/jam/draw", {}))}
                >
                  {s.phase === "draw" &&
                  (s.drawer === s.participant || s.role === "admin")
                    ? t("내 차례! 카드 뽑기", "My turn! Draw a card")
                    : t("곧 함께 카드를 뽑아요", "Waiting for the next draw")}
                </button>
                <p>
                  {t(
                    "한 사람이 뽑으면 모두에게 같은 카드가 열려요.",
                    "One person draws. Everyone sees the same card.",
                  )}
                </p>
                <img
                  className="j-qr"
                  src={"/api/rooms/" + code + "/qr"}
                  alt="Join QR"
                />
              </section>
            ) : (
              <>
                {s.card_data && s.phase === "answer" && (
                  <article className="j-scene">
                    <span>
                      SCENE {String(s.card + 1).padStart(2, "0")} / ROUND{" "}
                      {s.drawn.length}
                    </span>
                    <p>{s.card_data[lang === "ko" ? 0 : 1]}</p>
                    <h1>“{s.card_data[lang === "ko" ? 2 : 3]}”</h1>
                    <small>{s.card_data[lang === "ko" ? 3 : 2]}</small>
                  </article>
                )}
                {s.phase === "answer" &&
                (s.role !== "participant" || screen) ? (
                  <section className="j-wait">
                    <h2>
                      {t(
                        "지금은 각자의 생각을 적는 시간",
                        "Time for your own first thoughts",
                      )}
                    </h2>
                    <p>
                      {s.submitted} / {s.total}{" "}
                      {t(
                        "응답 완료 · 답변은 아직 비공개예요",
                        "submitted · Responses are still private",
                      )}
                    </p>
                  </section>
                ) : null}
                {s.phase === "answer" &&
                  s.role === "participant" &&
                  s.participants.find((p: D) => p.id === s.participant)
                    ?.eligible !== false &&
                  !initial && (
                    <section
                      className="j-form"
                      onTouchStart={(e) =>
                        (touch.current = e.touches[0].clientX)
                      }
                      onTouchEnd={(e) => {
                        const x = touch.current;
                        touch.current = null;
                        if (
                          x === null ||
                          ["TEXTAREA", "INPUT", "BUTTON"].includes(
                            (e.target as HTMLElement).tagName,
                          )
                        )
                          return;
                        const dx = e.changedTouches[0].clientX - x;
                        if (dx < -80 && step < 2) Step(step + 1);
                        if (dx > 80 && step > 0) Step(step - 1);
                      }}
                    >
                      <p className="j-kicker">YOUR TAKE · {step + 1} / 3</p>
                      <h2>
                        {
                          [
                            t("어떻게 들었어?", "What did you hear?"),
                            t("뭐라고 할래?", "What would you say?"),
                            t("익숙한 상황이야?", "Does this feel familiar?"),
                          ][step]
                        }
                      </h2>
                      {step === 0 && (
                        <>
                          {field(
                            "meaning",
                            "이 사람이 하려는 말은?",
                            "What do you think this person means?",
                          )}
                          <fieldset>
                            <legend>
                              {t("어느 쪽에 가까워요?", "Which is closer?")}
                            </legend>
                            <div className="j-options">
                              {[
                                ["literal", "말 그대로", "Literal"],
                                ["other", "다른 뜻", "Something else"],
                                ["both", "둘 다 가능", "Could be either"],
                                ["unsure", "모르겠어", "Not sure"],
                              ].map(([v, k, e]) => (
                                <button
                                  className={
                                    answers.choice === v ? "selected" : ""
                                  }
                                  aria-pressed={answers.choice === v}
                                  key={v}
                                  onClick={() =>
                                    change(
                                      "choice",
                                      answers.choice === v ? "" : v,
                                    )
                                  }
                                >
                                  {t(k, e)}
                                </button>
                              ))}
                            </div>
                          </fieldset>
                          {scale(
                            "certainty",
                            "얼마나 확신하나요?",
                            "How sure are you?",
                          )}
                        </>
                      )}
                      {step === 1 && (
                        <>
                          {field(
                            "reply",
                            "내가 할 대답",
                            "What would you say back?",
                          )}
                          {field(
                            "action",
                            "실제로 할 행동",
                            "What would you actually do?",
                          )}
                        </>
                      )}
                      {step === 2 && (
                        <>
                          {scale(
                            "familiarity",
                            "내가 자란 곳에서 얼마나 흔한가요?",
                            "How common is this where you grew up?",
                          )}
                          {field(
                            "emotion",
                            "선택: 그때 내 기분은?",
                            "Optional: how would you feel?",
                          )}
                          <p>
                            {t(
                              "제출하면 보드에 함께 모여요.",
                              "Submit to add your thoughts to the board.",
                            )}
                          </p>
                        </>
                      )}
                      <div className="j-actions">
                        <button
                          disabled={step === 0}
                          onClick={() => Step(step - 1)}
                        >
                          ← {t("이전", "Back")}
                        </button>
                        <button
                          className="j-primary"
                          disabled={busy}
                          onClick={advance}
                        >
                          {step === 2
                            ? t("내 생각 보내기", "Send my thoughts")
                            : t("다음", "Next")}{" "}
                          →
                        </button>
                      </div>
                      <small>
                        {t(
                          "자동 저장 · 좌우로 넘기기",
                          "Autosaved · Swipe to move",
                        )}
                      </small>
                    </section>
                  )}
                {s.phase === "answer" && initial && (
                  <section className="j-wait">
                    <div className="j-orbit">✓</div>
                    <h2>{t("내 생각을 보냈어요.", "Your thoughts are in.")}</h2>
                    <p>
                      {t(
                        "모두 제출하면 보드가 열려요.",
                        "The board opens when everyone submits.",
                      )}
                    </p>
                    <small>
                      {s.submitted}/{s.total}
                    </small>
                  </section>
                )}
                {["discussion", "done"].includes(s.phase) && (
                  <section className="j-discuss">
                    <p className="j-kicker">REVEAL & TALK</p>
                    <h2>
                      {s.phase === "done"
                        ? t(
                            "오늘 발견한 다른 느낌들",
                            "Different feelings we found today",
                          )
                        : t(
                            "같은 말, 이렇게 다르게 들었어요.",
                            "Same words. Different readings.",
                          )}
                    </h2>
                    <p>{t("자유롭게 이야기해요.", "Let’s talk.")}</p>
                    {s.role === "participant" && s.phase === "discussion" && (
                      <>
                        <details>
                          <summary>
                            {t(
                              "토론 뒤 생각이 달라졌나요?",
                              "Did your thinking change?",
                            )}
                          </summary>
                          {field(
                            "meaning",
                            "지금의 해석",
                            "Your interpretation now",
                          )}
                          {field("reply", "지금 할 대답", "Your reply now")}
                          {field("action", "지금 할 행동", "Your action now")}
                          <button
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await api(root + "/jam/response", {
                                  card: s.card,
                                  answers,
                                  language: lang,
                                });
                                M(
                                  t(
                                    "토론 뒤 응답을 별도로 저장했어요.",
                                    "Saved separately from your first response.",
                                  ),
                                );
                              })
                            }
                          >
                            {t("바뀐 생각 기록", "Save reflection")}
                          </button>
                        </details>
                        <div className="j-note">
                          <h2>
                            {t(
                              "경아, 이런 상황에서는…",
                              "Kyung, in this situation…",
                            )}
                          </h2>
                          <p>
                            {t(
                              "우리 조의 생각과 다른 의견을 남겨요.",
                              "Capture your group’s ideas and disagreements.",
                            )}
                          </p>
                          <textarea
                            aria-label="Group note"
                            rows={4}
                            maxLength={4000}
                            value={note}
                            onChange={(e) => N(e.target.value)}
                            placeholder={t(
                              "이 말은 ___일 수도 있어. 바로 ___라고 단정하지 말고 ___. 다만 ___인 경우에는 다를 수 있어.",
                              "This may mean ___. Rather than assuming ___, try ___. An exception might be ___.",
                            )}
                          />
                          <button
                            className="j-primary"
                            disabled={busy || !note.trim()}
                            onClick={() =>
                              run(async () => {
                                await api(root + "/jam/note", {
                                  card: s.card,
                                  text: note,
                                });
                                N("");
                                M(
                                  t(
                                    "경의 노트에 메모를 남겼어요. AI 프롬프트에는 아직 적용하지 않았어요.",
                                    "Saved in Kyung’s notebook. Not yet applied to an AI prompt.",
                                  ),
                                );
                              })
                            }
                          >
                            {t("우리 조 메모 남기기", "Save our group note")} ↗
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                )}
              </>
            )}
            {!["discussion", "done"].includes(s.phase) && (
              <SharedBoard s={s} lang={lang} t={t} />
            )}
            {message && (
              <p role="status" className="j-success">
                {message}
              </p>
            )}
          </>
        )}
      </main>
      <footer>
        DAY 01 — DRAW · SHARE · MAKE NOTES{" "}
        <a href="/?archive=1">
          {t("결과 보관함 · 진행자", "Results archive · facilitator")}
        </a>
      </footer>
    </div>
  );
}
