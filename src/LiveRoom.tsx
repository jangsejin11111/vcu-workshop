import React, { useEffect, useState } from "react";
type D = Record<string, any>;
export function RoomCast({
  s,
  t,
}: {
  s: D;
  t: (a: string, b: string) => string;
}) {
  const [now, Now] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => Now(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  const spinning = s.phase === "draw" && now < s.roulette_until * 1000;
  const ids = s.roulette_ids || [];
  const active = spinning
    ? ids[Math.floor((now - s.roulette_started * 1000) / 110) % ids.length]
    : s.phase === "draw"
      ? s.drawer
      : null;
  return (
    <section className="cast">
      <div className="cast-heading">
        <b>
          {t("우리 방", "Our room")} <span>{s.joined}</span>
        </b>
        <span>
          {s.phase === "answer"
            ? `${t("작성 중", "Writing")} ${s.typing} · ${t("제출", "Submitted")} ${s.submitted}/${s.total}`
            : spinning
              ? t("누가 뽑을까?", "Who will draw?")
              : s.phase === "draw"
                ? t("카드를 뽑아주세요!", "Draw a card!")
                : t("함께하는 중", "Together")}
        </span>
      </div>
      <div className="cast-list">
        {s.participants.map((p: D, i: number) => (
          <div
            className={
              "cast-person " +
              (active === p.id ? "chosen " : "") +
              (p.status === "submitted" ? "sent" : "")
            }
            key={p.id}
            style={
              {
                "--avatar": [
                  "#d6ed8e",
                  "#ffbd96",
                  "#b6caff",
                  "#edbbec",
                  "#ffe082",
                ][i % 5],
              } as React.CSSProperties
            }
          >
            <div className="avatar">
              <span className="eyes">● ●</span>
              <span className="mouth">◡</span>
              {p.status === "submitted" && <b className="check">✓</b>}
              {p.status === "typing" && (
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </div>
            <strong>
              {p.pid}
              {p.id === s.participant ? " · " + t("나", "Me") : ""}
            </strong>
            <small>
              {active === p.id
                ? spinning
                  ? "•••"
                  : t("네 차례! 뽑아줘", "Your turn!")
                : p.status === "submitted"
                  ? t("제출 완료", "Sent")
                  : p.status === "typing"
                    ? t("작성 중", "Writing")
                    : !p.eligible && s.phase === "answer"
                      ? t("다음 라운드", "Next round")
                      : "　"}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}
export function CardReveal({ s, lang }: { s: D; lang: string }) {
  const [show, Show] = useState(false);
  useEffect(() => {
    const key = "jam-reveal-" + s.id + "-" + s.drawn_at;
    const age = Date.now() - s.drawn_at * 1000;
    if (!s.drawn_at || age > 5000 || sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "seen");
    Show(true);
    const timer = setTimeout(() => Show(false), Math.max(1000, 4200 - age));
    return () => clearTimeout(timer);
  }, [s.drawn_at]);
  if (!show || !s.card_data) return null;
  return (
    <div
      className="reveal-overlay"
      role="dialog"
      aria-label={lang === "ko" ? "상황카드 공개" : "Scene revealed"}
      onClick={() => Show(false)}
    >
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 32 }, (_, i) => (
          <i
            key={i}
            style={
              {
                "--x": `${(i * 37) % 100}%`,
                "--delay": `${(i % 8) * 0.08}s`,
                "--angle": `${i * 41}deg`,
                "--color": ["#d6ed8e", "#ff926f", "#b6caff", "#ffe082"][i % 4],
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <article className="reveal-card">
        <small>ROUND {s.drawn.length}</small>
        <p>{s.card_data[lang === "ko" ? 0 : 1]}</p>
        <h1>“{s.card_data[lang === "ko" ? 2 : 3]}”</h1>
        <button onClick={() => Show(false)}>
          {lang === "ko" ? "시작 →" : "Start →"}
        </button>
      </article>
    </div>
  );
}
export function SharedBoard({
  s,
  lang,
  t,
}: {
  s: D;
  lang: string;
  t: (a: string, b: string) => string;
}) {
  const [selected, Select] = useState<number | null>(null),
    [phase, Phase] = useState("initial");
  useEffect(() => {
    if (s.phase === "discussion" || s.phase === "done") Select(s.card);
  }, [s.phase, s.card]);
  const item = s.board.find((b: D) => b.card === selected);
  const analysis = s.analyses
    .filter((r: D) => r.pairs.some((p: D) => p.card === selected))
    .at(-1);
  return (
    <section className="shared-board">
      <div className="board-title">
        <h2>{t("우리의 보드", "Our board")}</h2>
        <b>
          {s.board.length} {t("라운드", "rounds")}
        </b>
      </div>
      <div className="board-tabs">
        {s.board.map((b: D) => (
          <button
            className={b.card === selected ? "selected" : ""}
            key={b.card}
            onClick={() => Select(b.card)}
          >
            <small>ROUND {b.round}</small>
            <strong>{b.scene[lang === "ko" ? 2 : 3]}</strong>
            <span>
              {b.responses.filter((r: D) => r.phase === "initial").length}{" "}
              {t("개의 생각", "thoughts")} ↗
            </span>
          </button>
        ))}
      </div>
      {!s.board.length ? (
        <p>
          {t(
            "제출이 끝난 카드는 여기에 모여요.",
            "Completed cards collect here.",
          )}
        </p>
      ) : !item ? (
        <button onClick={() => Select(s.board[0].card)}>
          {t("보드 열기", "Open board")}
        </button>
      ) : (
        <div className="board-layout">
          <div>
            <div className="board-topic">
              <small>ROUND {item.round}</small>
              <h2>“{item.scene[lang === "ko" ? 2 : 3]}”</h2>
              <div className="j-options">
                <button
                  className={phase === "initial" ? "selected" : ""}
                  onClick={() => Phase("initial")}
                >
                  {t("첫 생각", "First thoughts")}
                </button>
                <button
                  className={phase === "discussion" ? "selected" : ""}
                  onClick={() => Phase("discussion")}
                >
                  {t("토론 뒤", "After discussion")}
                </button>
              </div>
            </div>
            <div className="sticky-grid">
              {item.responses
                .filter((r: D) => r.phase === phase)
                .map((r: D, i: number) => (
                  <article
                    className="sticky"
                    key={r.id}
                    style={
                      {
                        "--tilt": `${i % 2 ? 1 : -1}deg`,
                        "--note": ["#fff1ad", "#d9edc8", "#eadbfa", "#d3e9f4"][
                          i % 4
                        ],
                      } as React.CSSProperties
                    }
                  >
                    <strong>{r.pid}</strong>
                    <h3>{r.answers.meaning || "—"}</h3>
                    <p>
                      <b>{t("대답", "Say")}</b> {r.answers.reply || "—"}
                    </p>
                    <p>
                      <b>{t("행동", "Do")}</b> {r.answers.action || "—"}
                    </p>
                    {r.answers.emotion && (
                      <p>
                        <b>{t("기분", "Feel")}</b> {r.answers.emotion}
                      </p>
                    )}
                    <details>
                      <summary>{t("더 보기", "More")}</summary>
                      <p>
                        {r.answers.choice || "—"} · {t("확신", "Certainty")}{" "}
                        {r.answers.certainty || "—"}/5 ·{" "}
                        {t("흔함", "Frequency")} {r.answers.familiarity || "—"}
                        /5
                      </p>
                    </details>
                  </article>
                ))}
            </div>
            {item.notes.map((n: D) => (
              <blockquote key={n.id}>
                <small>{n.group}</small>
                <p>{n.text}</p>
              </blockquote>
            ))}
          </div>
          <aside className="bert-side">
            <span className="j-kicker">SENTENCE-BERT</span>
            <h3>{t("가까운 생각", "Similar readings")}</h3>
            {!analysis ? (
              <p>{t("아직 분석 전이에요.", "Not analyzed yet.")}</p>
            ) : (
              <>
                <small>
                  {
                    (
                      {
                        meaning: t("해석", "Meaning"),
                        reply: t("대답", "Reply"),
                        action: t("행동", "Action"),
                        emotion: t("감정", "Emotion"),
                      } as D
                    )[analysis.field]
                  }{" "}
                  ·{" "}
                  {analysis.phase === "initial"
                    ? t("최초 응답", "Initial")
                    : t("토론 뒤", "After discussion")}
                </small>
                {analysis.pairs
                  .filter((p: D) => p.card === selected)
                  .slice(0, 5)
                  .map((p: D) => (
                    <article key={p.left + p.right}>
                      <b>
                        {p.left_pid} ↔ {p.right_pid}{" "}
                        <span>{p.score.toFixed(2)}</span>
                      </b>
                      <p>{p.left_text}</p>
                      <p>{p.right_text}</p>
                    </article>
                  ))}
                <small>
                  {t(
                    "유사도 추천 · 최종 판단은 사람에게",
                    "Similarity suggestions · people decide",
                  )}
                </small>
              </>
            )}
            {s.role === "admin" && (
              <a
                href={
                  "/?archive=1&room=" +
                  new URLSearchParams(location.search).get("room")
                }
              >
                {t("분석 보관함 →", "Analysis archive →")}
              </a>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
