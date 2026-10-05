import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { socket } from "../lib/socket.js";
import { SERVER_URL } from "../lib/api.js";
import { ROUND_TYPE_LABELS, FAST_TRACK_LABEL } from "../lib/roundTypes.js";

export default function PresentationScreen() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [joinError, setJoinError] = useState("");
  const [roundName, setRoundName] = useState("");
  const [players, setPlayers] = useState([]);
  const [phase, setPhase] = useState("lobby"); // lobby | picture | question | reveal | leaderboard | ended
  const [picture, setPicture] = useState(null);
  const [board, setBoard] = useState(null);
  const [answerCount, setAnswerCount] = useState({ answered: 0, total: 0 });
  const [reveal, setReveal] = useState(null);
  const [standings, setStandings] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.emit("spectator:join", { code }, (res) => {
      if (res.ok) setRoundName(res.roundName);
      else setJoinError(res.error);
    });

    socket.on("room:players", setPlayers);

    socket.on("game:roundSelected", (data) => setRoundName(data.roundName));

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
      socket.off("room:players");
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
    tickRef.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tickRef.current);
  }, [phase]);

  if (joinError) {
    return (
      <div className="screen center">
        <h1 className="title wrong-text">Can't open this room</h1>
        <p className="subtitle">{joinError}</p>
      </div>
    );
  }

  const pictureUrl = picture?.pictureUrl || board?.pictureUrl;

  const correctResults = reveal ? reveal.results.filter((r) => r.answer?.isCorrect) : [];
  const fastest = [...correctResults].sort((a, b) => {
    const ra = a.answer.rank ?? Infinity;
    const rb = b.answer.rank ?? Infinity;
    if (ra !== rb) return ra - rb;
    return a.answer.elapsedMs - b.answer.elapsedMs;
  });

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
                {p.name}
                {p.online === false && " (away)"}
              </span>
            ))}
          </div>
        </div>
      )}

      {phase === "picture" && picture && (
        <div className="present-center">
          <p className="present-progress">
            Q{picture.index + 1} / {picture.total}
          </p>
          {pictureUrl && (
            <div className="picture-display present-picture">
              <img src={`${SERVER_URL}${pictureUrl}`} alt="" />
            </div>
          )}
          <h1 className="present-question">{picture.text}</h1>
        </div>
      )}

      {phase === "question" && board && (
        <div className="present-center">
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
          <h1 className="present-question">{board.text}</h1>

          {board.type === "multiple_choice" && (
            <div className="present-options">
              {board.options.map((opt, i) => (
                <div className="present-option" key={i}>
                  {opt}
                </div>
              ))}
            </div>
          )}
          {board.type === "normal" && <p className="present-hint">Press the first letter on your phone</p>}
          {board.type === "number" && <p className="present-hint">Type your answer on your phone</p>}
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
            <div className="present-options">
              <div className="present-option correct">
                {reveal.correctLetter} — {reveal.answerText}
              </div>
            </div>
          )}
          {reveal.type === "number" && (
            <div className="present-options">
              <div className="present-option correct">{reveal.correctNumber}</div>
            </div>
          )}
          {reveal.type === "sequence" && (
            <div className="present-options">
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
                      {r.name} <span className="present-fastest-points">+{r.answer.points}</span>
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
              <li key={p.id} className={i < 3 ? `podium podium-${i + 1}` : ""}>
                <span className="rank">#{i + 1}</span> {p.name} <span className="score">{p.score}</span>
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
