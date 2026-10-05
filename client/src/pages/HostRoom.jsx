import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { socket } from "../lib/socket.js";
import { SERVER_URL } from "../lib/api.js";
import { ROUND_TYPE_LABELS, ROUND_TYPE_HINTS } from "../lib/roundTypes.js";
import AddRoundModal from "../components/AddRoundModal.jsx";
import RunningOrderPanel from "../components/RunningOrderPanel.jsx";

const PHASE_LABEL = {
  lobby: "Waiting for players",
  picture: "Showing picture",
  question: "Question live",
  reveal: "Revealing answer",
  leaderboard: "Leaderboard",
  ended: "Quiz finished",
};

export default function HostRoom() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [players, setPlayers] = useState([]);
  const [phase, setPhase] = useState("lobby"); // lobby | picture | question | reveal | leaderboard | ended
  const [currentRound, setCurrentRound] = useState(null); // { name, roundType, questionCount }
  const [queue, setQueue] = useState([]); // the running order — editable any time, until each entry is played
  const [showAddRound, setShowAddRound] = useState(false);
  const [picture, setPicture] = useState(null); // { pictureUrl, text, index, total }
  const [board, setBoard] = useState(null); // answer board payload
  const [answerCount, setAnswerCount] = useState({ answered: 0, total: 0 });
  const [reveal, setReveal] = useState(null);
  const [standings, setStandings] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    // Re-identify as this room's host on every (re)connect — covers both a
    // fresh page load and the client's own reconnect after a network blip.
    // If the server's grace period already expired, bounce back to setup.
    function resume() {
      socket.emit("host:resume", { code }, (res) => {
        if (!res?.ok) return navigate("/host");
        if (res.round) setCurrentRound(res.round);
        if (res.queue) setQueue(res.queue);
      });
    }

    if (socket.connected) resume();
    else socket.connect();
    socket.on("connect", resume);

    socket.on("room:players", setPlayers);
    socket.on("game:queue", setQueue);

    socket.on("game:roundSelected", (data) => setCurrentRound(data));

    socket.on("game:picture", (data) => {
      setPicture(data);
      setBoard(null);
      setReveal(null);
      setAnswerCount({ answered: 0, total: 0 });
      setPhase("picture");
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
      socket.off("connect", resume);
      socket.off("room:players");
      socket.off("game:queue");
      socket.off("game:roundSelected");
      socket.off("game:picture");
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
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [phase]);

  function startQuestion() {
    socket.emit("host:startQuestion", { code }, (res) => {
      if (!res.ok && res.error) alert(res.error);
    });
  }

  function revealBoard() {
    socket.emit("host:revealBoard", { code }, (res) => {
      if (!res.ok && res.error) alert(res.error);
    });
  }

  function forceReveal() {
    socket.emit("host:forceReveal", { code });
  }

  function endGame() {
    socket.emit("host:endGame", { code }, () => navigate("/host"));
  }

  function confirmEndGame() {
    if (window.confirm("End the quiz for everyone now? This can't be undone.")) endGame();
  }

  async function copyCode() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure LAN context) — the code is already on screen.
    }
  }

  const pictureUrl = picture?.pictureUrl || board?.pictureUrl;
  const answeredPct = players.length ? Math.round((100 * answerCount.answered) / players.length) : 0;
  const canStart = queue.length > 0;

  return (
    <div className="host-screen">
      <div className="host-topbar">
        <div className="host-room-code">
          <span className="host-room-code-label">Room</span>
          <span className="host-room-code-value">{code}</span>
          <button className="btn btn-small" onClick={copyCode}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div className="host-topbar-actions">
          <button className="btn btn-small" onClick={() => window.open(`/present/${code}`, "_blank", "noopener")}>
            📺 Presentation Screen
          </button>
          {phase !== "ended" && (
            <button className="btn btn-small btn-danger" onClick={confirmEndGame}>
              End game
            </button>
          )}
        </div>
      </div>

      <div className="host-grid">
        <div className="host-stage">
          {phase === "lobby" && (
            <>
              <h2>Waiting for players...</h2>
              <p className="subtitle">
                Build your running order on the right while players join — it's never locked in until a round
                actually starts.
              </p>
              <button className="btn btn-primary btn-large" onClick={startQuestion} disabled={!canStart}>
                Start Quiz
              </button>
              {!canStart && <p className="subtitle">Add a round to the running order first.</p>}
              {canStart && players.length === 0 && <p className="subtitle">Waiting for at least one player...</p>}
            </>
          )}

          {phase === "picture" && picture && (
            <>
              <p className="subtitle">
                Q{picture.index + 1} / {picture.total}
              </p>
              {pictureUrl && (
                <div className="picture-display">
                  <img src={`${SERVER_URL}${pictureUrl}`} alt="" />
                </div>
              )}
              <h2 className="question-text">{picture.text}</h2>
              <button className="btn btn-primary btn-large" onClick={revealBoard}>
                Reveal Answer Board
              </button>
            </>
          )}

          {phase === "question" && board && (
            <>
              <div className="timer-badge">{secondsLeft}s</div>
              {pictureUrl && (
                <div className="picture-display">
                  <img src={`${SERVER_URL}${pictureUrl}`} alt="" />
                </div>
              )}
              <h2 className="question-text">
                Q{board.index + 1} / {board.total}: {board.text}
              </h2>
              {board.type === "multiple_choice" && (
                <div className="options-display">
                  {board.options.map((opt, i) => (
                    <div className="option-display" key={i}>
                      {opt}
                    </div>
                  ))}
                </div>
              )}
              {board.type === "normal" && (
                <p className="subtitle">Players press the letter on their phone — the alphabet board.</p>
              )}
              {board.type === "number" && <p className="subtitle">Players type their answer on a number pad.</p>}
              {board.type === "sequence" && (
                <div className="options-display">
                  {board.items.map((item) => (
                    <div className="option-display" key={item.originalIndex}>
                      {item.text}
                    </div>
                  ))}
                </div>
              )}
              <p className="subtitle">{ROUND_TYPE_HINTS[board.roundType]}</p>
              <button className="btn" onClick={forceReveal}>
                Reveal now
              </button>
            </>
          )}

          {phase === "reveal" && reveal && board && (
            <>
              {pictureUrl && (
                <div className="picture-display">
                  <img src={`${SERVER_URL}${pictureUrl}`} alt="" />
                </div>
              )}
              <h2 className="question-text">{board.text}</h2>
              {reveal.type === "multiple_choice" && (
                <div className="options-display">
                  {board.options.map((opt, i) => (
                    <div className={`option-display ${i === reveal.correctIndex ? "correct" : ""}`} key={i}>
                      {opt} {i === reveal.correctIndex && "✓"}
                    </div>
                  ))}
                </div>
              )}
              {reveal.type === "normal" && (
                <div className="options-display">
                  <div className="option-display correct">
                    {reveal.correctLetter} — {reveal.answerText}
                  </div>
                </div>
              )}
              {reveal.type === "number" && (
                <div className="options-display">
                  <div className="option-display correct">{reveal.correctNumber}</div>
                </div>
              )}
              {reveal.type === "sequence" && (
                <div className="options-display">
                  <div className="option-display correct">{reveal.correctOrder.join(" → ")}</div>
                </div>
              )}
              <p className="subtitle">Calculating leaderboard...</p>
            </>
          )}

          {phase === "leaderboard" && hasMore && (
            <>
              <h2>Leaderboard</h2>
              <ol className="leaderboard">
                {standings.map((p, i) => (
                  <li key={p.id}>
                    <span className="rank">#{i + 1}</span> {p.name} <span className="score">{p.score}</span>
                  </li>
                ))}
              </ol>
              <button className="btn btn-primary btn-large" onClick={startQuestion}>
                Next Question
              </button>
            </>
          )}

          {phase === "leaderboard" && !hasMore && (
            <>
              <h2>Round over!</h2>
              <ol className="leaderboard">
                {standings.map((p, i) => (
                  <li key={p.id}>
                    <span className="rank">#{i + 1}</span> {p.name} <span className="score">{p.score}</span>
                  </li>
                ))}
              </ol>
              <button className="btn btn-primary btn-large" onClick={startQuestion} disabled={!canStart}>
                Start Next Round
              </button>
              {!canStart && <p className="subtitle">Add a round to the running order (on the right) first.</p>}
              <button className="btn btn-link" onClick={confirmEndGame}>
                Or end the quiz here
              </button>
            </>
          )}

          {phase === "ended" && (
            <>
              <h2>🏆 Final Results</h2>
              <ol className="leaderboard">
                {standings.map((p, i) => (
                  <li key={p.id}>
                    <span className="rank">#{i + 1}</span> {p.name} <span className="score">{p.score}</span>
                  </li>
                ))}
              </ol>
              <button className="btn btn-primary" onClick={() => navigate("/host")}>
                Back to quizzes
              </button>
            </>
          )}
        </div>

        <aside className="host-sidebar">
          <div className="host-sidebar-section">
            <span className="host-sidebar-label">Progress</span>
            <span className="phase-pill">{PHASE_LABEL[phase]}</span>
          </div>

          {currentRound && (
            <div className="host-sidebar-section">
              <span className="host-sidebar-label">Now playing</span>
              <span className="host-sidebar-value">{currentRound.name}</span>
              <span className="round-type-pill">{ROUND_TYPE_LABELS[currentRound.roundType]}</span>
            </div>
          )}

          {phase === "question" && (
            <div className="host-sidebar-section">
              <span className="host-sidebar-label">Answered</span>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${answeredPct}%` }} />
              </div>
              <span className="host-sidebar-value">
                {answerCount.answered} / {players.length}
              </span>
            </div>
          )}

          <RunningOrderPanel code={code} queue={queue} onAddRound={() => setShowAddRound(true)} />

          <div className="host-sidebar-section">
            <span className="host-sidebar-label">Players ({players.length})</span>
            <div className="player-chip-list">
              {players.map((p) => (
                <span className={`chip ${p.online === false ? "chip-offline" : ""}`} key={p.id}>
                  {p.name}
                  {p.online === false && " (away)"}
                </span>
              ))}
              {players.length === 0 && <p className="subtitle">Nobody's joined yet.</p>}
            </div>
          </div>
        </aside>
      </div>

      {showAddRound && <AddRoundModal code={code} onClose={() => setShowAddRound(false)} />}
    </div>
  );
}
