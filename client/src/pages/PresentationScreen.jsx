import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { socket } from "../lib/socket.js";
import { SERVER_URL } from "../lib/api.js";
import { ROUND_TYPE_LABELS, FAST_TRACK_LABEL } from "../lib/roundTypes.js";
import { rankColor } from "../lib/rankColor.js";

// Shown above the question on both the intro screen and the live question
// board, so the room knows what kind of question is coming and how to
// answer it before the options/board even appear.
const QUESTION_TYPE_META = {
  multiple_choice: { label: "✅ Multiple choice question", hint: "Choose the correct option on your phone" },
  normal: { label: "🔤 Alphabet question", hint: "Tap the first letter of the answer" },
  number: { label: "🔢 Number question", hint: "Type your answer on the keypad" },
  sequence: { label: "🔀 Sequence question", hint: "Put the events in the right order" },
};

export default function PresentationScreen() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [joinError, setJoinError] = useState("");
  const [roundName, setRoundName] = useState("");
  const [players, setPlayers] = useState([]);
  const [phase, setPhase] = useState("lobby"); // lobby | intro | question | reveal | leaderboard | ended
  const [intro, setIntro] = useState(null);
  const [board, setBoard] = useState(null);
  const [answerCount, setAnswerCount] = useState({ answered: 0, total: 0 });
  const [reveal, setReveal] = useState(null);
  const [standings, setStandings] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showFastestSplash, setShowFastestSplash] = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.emit("spectator:join", { code }, (res) => {
      if (res.ok) setRoundName(res.roundName);
      else setJoinError(res.error);
    });

    socket.on("room:players", setPlayers);

    socket.on("game:roundSelected", (data) => setRoundName(data.roundName));

    socket.on("game:questionIntro", (data) => {
      setIntro(data);
      setBoard(null);
      setReveal(null);
      setAnswerCount({ answered: 0, total: 0 });
      setPhase("intro");
    });

    socket.on("game:answerBoard", (b) => {
      setBoard(b);
      setReveal(null);
      setAnswerCount({ answered: 0, total: 0 });
      setPhase("question");
      setSecondsLeft(b.timeLimitSeconds);
    });

    socket.on("game:answerCount", setAnswerCount);

    socket.on("game:reveal", (data) => {
      setReveal(data);
      setPhase("reveal");
      setShowFastestSplash(false);
    });

    socket.on("game:leaderboard", ({ standings, hasMore }) => {
      setStandings(standings);
      setHasMore(hasMore);
      setPhase("leaderboard");
    });

    socket.on("game:ended", ({ standings }) => {
      setStandings(standings);
      setPhase("ended");
    });

    socket.on("game:hostLeft", () => navigate("/host"));

    return () => {
      socket.off("room:players");
      socket.off("game:roundSelected");
      socket.off("game:questionIntro");
      socket.off("game:answerBoard");
      socket.off("game:answerCount");
      socket.off("game:reveal");
      socket.off("game:leaderboard");
      socket.off("game:ended");
      socket.off("game:hostLeft");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "question") {
      clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tickRef.current);
  }, [phase]);

  // The correct answer shows immediately on reveal; the fastest-answerer splash
  // waits 3s so it doesn't cover the answer before everyone's had a look at it.
  useEffect(() => {
    if (phase !== "reveal") return;
    const t = setTimeout(() => setShowFastestSplash(true), 3000);
    return () => clearTimeout(t);
  }, [phase, reveal]);

  if (joinError) {
    return (
      <div className="screen center">
        <h1 className="title wrong-text">Can't open this room</h1>
        <p className="subtitle">{joinError}</p>
      </div>
    );
  }

  const pictureUrl = intro?.pictureUrl || board?.pictureUrl;

  const correctResults = reveal ? reveal.results.filter((r) => r.answer?.isCorrect) : [];
  const fastest = [...correctResults].sort((a, b) => {
    const ra = a.answer.rank ?? Infinity;
    const rb = b.answer.rank ?? Infinity;
    if (ra !== rb) return ra - rb;
    return a.answer.elapsedMs - b.answer.elapsedMs;
  });
  const fastestPlayer = fastest[0] || null;

  // Random burst directions for the fastest-player emoji splash — memoized so
  // they don't re-randomize on every re-render, only when a new one is revealed.
  const splashParticles = useMemo(() => {
    if (!fastestPlayer) return [];
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      angle: (360 / 12) * i + (Math.random() * 16 - 8),
      distance: 100 + Math.random() * 80,
      delay: Math.random() * 0.15,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fastestPlayer?.id, board?.index]);

  return (
    <div className="presentation-screen">
      {phase === "lobby" && (
        <div className="present-center">
          <h1 className="present-brand">⚡ Too Quick To Cheat</h1>
          <p className="present-eyebrow">{roundName || "Waiting for the host to pick a round..."}</p>
          <p className="present-label">Join at</p>
          <p className="present-join-url">{window.location.origin}/join</p>
          <p className="present-label">Room code</p>
          <div className="present-code">{code}</div>
          <p className="present-label">{players.length} player{players.length === 1 ? "" : "s"} joined</p>
          <div className="present-chip-list">
            {players.map((p) => (
              <span className={`chip ${p.online === false ? "chip-offline" : ""}`} key={p.id}>
                {p.emoji} {p.name}
                {p.online === false && " (away)"}
              </span>
            ))}
          </div>
        </div>
      )}

      {phase === "intro" && intro && (
        <div className="present-center present-intro-row">
          <div className="present-main">
            {QUESTION_TYPE_META[intro.type] && (
              <>
                <p className="present-type-label">{QUESTION_TYPE_META[intro.type].label}</p>
                <p className="present-type-hint">{QUESTION_TYPE_META[intro.type].hint}</p>
              </>
            )}
            {pictureUrl && (
              <div className="picture-display present-picture">
                <img src={`${SERVER_URL}${pictureUrl}`} alt="" />
              </div>
            )}
            <div className="present-question-box">
              <p className="present-progress">
                Q{intro.index + 1} / {intro.total}
              </p>
              <h1 className="present-question">{intro.text}</h1>
            </div>
          </div>

          {/* Abstract, type-generic preview of what the player's phone shows —
              never real question/answer content, so it works before the board loads. */}
          {QUESTION_TYPE_META[intro.type] && (
            <div className="phone-preview-wrap">
              <p className="phone-preview-label">Your phone shows</p>
              <div className="phone-mockup">
                <div className="pm-screen">
                  <div className="pm-topbar">
                    <span className="pm-hud pm-score">40 PTS</span>
                    <span className="pm-progress">
                      Q{intro.index + 1}/{intro.total}
                    </span>
                    <span className="pm-hud pm-timer">12s</span>
                  </div>
                  <div className="pm-timerbar">
                    <div className="pm-timerfill" />
                  </div>
                  <div className="pm-qpanel">
                    <div className="pm-qtext">QUESTION</div>
                  </div>

                  {intro.type === "multiple_choice" && (
                    <div className="pm-answers">
                      <div className="pm-answer">A</div>
                      <div className="pm-answer">B</div>
                      <div className="pm-answer">C</div>
                      <div className="pm-answer">D</div>
                    </div>
                  )}
                  {intro.type === "normal" && (
                    <div className="pm-letter-wrap">
                      <div className="pm-letter-grid">
                        {[
                          "A", "B", "C", "D", "E", "F", "G", "H",
                          "I", "J", "K", "L", "M", "N", "O", "P",
                          "Q", "R", "S", "T", "UV", "W", "X", "YZ",
                        ].map((l) => (
                          <div className="pm-letter-btn" key={l}>
                            {l}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {intro.type === "number" && (
                    <div className="pm-keypad-wrap">
                      <div className="pm-keypad-display">Enter your answer</div>
                      <div className="pm-keypad-grid">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                          <div className="pm-keypad-btn" key={n}>
                            {n}
                          </div>
                        ))}
                        <div className="pm-keypad-btn pm-clear">C</div>
                        <div className="pm-keypad-btn">0</div>
                        <div className="pm-keypad-btn pm-enter">Enter</div>
                      </div>
                    </div>
                  )}
                  {intro.type === "sequence" && (
                    <div className="pm-seq-wrap">
                      <div className="pm-seq-option">A</div>
                      <div className="pm-seq-option">B</div>
                      <div className="pm-seq-option">C</div>
                      <div className="pm-seq-option">D</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "question" && board && (
        <div className="present-center">
          {QUESTION_TYPE_META[board.type] && (
            <>
              <p className="present-type-label">{QUESTION_TYPE_META[board.type].label}</p>
              <p className="present-type-hint">{QUESTION_TYPE_META[board.type].hint}</p>
            </>
          )}
          <div className="present-top-row">
            <span className="present-progress">
              Q{board.index + 1} / {board.total}
            </span>
            <span className="present-timer">{secondsLeft}s</span>
          </div>
          {board.roundType !== "standard" && (
            <p className="present-label">{ROUND_TYPE_LABELS[board.roundType]} Round</p>
          )}
          {board.fastTrack && <p className="present-label fast-track-label">{FAST_TRACK_LABEL} active</p>}
          {pictureUrl && (
            <div className="picture-display present-picture">
              <img src={`${SERVER_URL}${pictureUrl}`} alt="" />
            </div>
          )}
          <div className="present-question-box">
            <h1 className="present-question">{board.text}</h1>
          </div>

          {board.type === "multiple_choice" && (
            <div className="present-options">
              {board.options.map((opt, i) => (
                <div className="present-option" key={i}>
                  {opt}
                </div>
              ))}
            </div>
          )}
          {board.type === "sequence" && (
            <div className="present-options">
              {board.items.map((item) => (
                <div className="present-option" key={item.originalIndex}>
                  {item.text}
                </div>
              ))}
            </div>
          )}

          <p className="present-answered">
            {answerCount.answered} / {players.length || answerCount.total} answered
          </p>
        </div>
      )}

      {phase === "reveal" && reveal && board && (
        <div className="present-center">
          {fastestPlayer && showFastestSplash && (
            <>
              <div className="emoji-splash-particles" key={`${board.index}-${fastestPlayer.id}`}>
                {splashParticles.map((p) => (
                  <span
                    key={p.id}
                    className="emoji-splash-particle"
                    style={{ "--angle": `${p.angle}deg`, "--distance": `${p.distance}px`, animationDelay: `${p.delay}s` }}
                  >
                    {fastestPlayer.emoji}
                  </span>
                ))}
              </div>
              <div className="emoji-splash-banner">
                <span className="emoji-splash-emoji">{fastestPlayer.emoji}</span>
                ⚡ {fastestPlayer.name} was fastest!
              </div>
            </>
          )}
          {reveal.fastTrackEvent && (
            <div className="present-fast-track-banner">
              ⚡ FAST TRACKED! ⚡
              <br />
              {reveal.fastTrackEvent.playerName} jumps to {reveal.fastTrackEvent.newScore} points!
            </div>
          )}
          <h1 className="present-question">{board.text}</h1>

          {reveal.type === "multiple_choice" && (
            <div className="present-options">
              {board.options.map((opt, i) => (
                <div className={`present-option ${i === reveal.correctIndex ? "correct" : ""}`} key={i}>
                  {opt} {i === reveal.correctIndex && "✓"}
                </div>
              ))}
            </div>
          )}
          {reveal.type === "normal" && (
            <div className="present-options present-options-single">
              <div className="present-option correct">
                {reveal.correctLetter} — {reveal.answerText}
              </div>
            </div>
          )}
          {reveal.type === "number" && (
            <div className="present-options present-options-single">
              <div className="present-option correct">{reveal.correctNumber}</div>
            </div>
          )}
          {reveal.type === "sequence" && (
            <div className="present-options present-options-single">
              <div className="present-option correct">{reveal.correctOrder.join(" → ")}</div>
            </div>
          )}

          <div className="present-stats">
            <div className="present-stat-block">
              <span className="present-stat-number correct-text">{correctResults.length}</span>
              <span className="present-stat-label">
                / {reveal.results.length} got it right
              </span>
            </div>
            {fastest.length > 0 && (
              <div className="present-fastest">
                <p className="present-label">⚡ Fastest correct</p>
                <ol className="present-fastest-list">
                  {fastest.slice(0, 5).map((r) => (
                    <li key={r.id}>
                      {r.emoji} {r.name} <span className="present-fastest-points">+{r.answer.points}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {(phase === "leaderboard" || phase === "ended") && (
        <div className="present-center">
          <h1 className="present-question">{phase === "ended" ? "🏆 Final Results" : "Leaderboard"}</h1>
          <ol className="present-leaderboard">
            {standings.map((p, i) => (
              <li
                key={p.id}
                className={i < 3 ? `podium podium-${i + 1}` : ""}
                style={{ background: rankColor(i, standings.length) }}
              >
                <span className="rank">#{i + 1}</span> {p.emoji} {p.name} <span className="score">{p.score}</span>
              </li>
            ))}
          </ol>
          {phase === "leaderboard" && (
            <p className="present-label">
              {hasMore ? "Next question coming up..." : "Waiting for the host to pick the next round..."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
