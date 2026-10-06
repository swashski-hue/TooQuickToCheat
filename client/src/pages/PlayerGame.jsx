import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { socket } from "../lib/socket.js";
import { SERVER_URL } from "../lib/api.js";
import { LETTER_TILES, tileLetters } from "../lib/answerLetter.js";
import { ROUND_TYPE_LABELS } from "../lib/roundTypes.js";
import { loadPlayerSession, clearPlayerSession } from "../lib/playerSession.js";

const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["C", "0", "enter"],
];

function ordinal(n) {
  const suffixes = { 1: "st", 2: "nd", 3: "rd" };
  return `${n}${suffixes[n] || "th"}`;
}

export default function PlayerGame() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [phase, setPhase] = useState("lobby"); // lobby | intro | question | reveal | leaderboard | ended
  const [intro, setIntro] = useState(null);
  const [board, setBoard] = useState(null);
  const [myAnswer, setMyAnswer] = useState(null); // { given, isCorrect, points, rank }
  const [reveal, setReveal] = useState(null);
  const [standings, setStandings] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [questionExpanded, setQuestionExpanded] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [wideNumber, setWideNumber] = useState(false); // number + Go Wide: accept ±1 for half points, changeable even after submitting
  const [sequenceOrder, setSequenceOrder] = useState([]); // array of {text, originalIndex}
  const [wideSkipIndex, setWideSkipIndex] = useState(null); // sequence + Go Wide: one item's position is ignored
  const [myScore, setMyScore] = useState(0);
  const tickRef = useRef(null);

  const myName = location.state?.name || loadPlayerSession(code);
  const initialRoundName = location.state?.roundName;

  useEffect(() => {
    // Re-identify as this player by name on every (re)connect — a screen
    // lock, backgrounded app, or brief Wi-Fi drop shouldn't lose the score.
    // Also covers the very first connect right after "player:join".
    function resume() {
      if (!myName) return navigate("/join");
      socket.emit("player:resume", { code, name: myName }, (res) => {
        if (!res?.ok) {
          clearPlayerSession();
          alert(res?.error || "Could not rejoin — please join again.");
          return navigate("/join");
        }
        if (typeof res.score === "number") setMyScore(res.score);
      });
    }

    if (socket.connected) resume();
    else socket.connect();
    socket.on("connect", resume);

    socket.on("game:questionIntro", (data) => {
      setIntro(data);
      setBoard(null);
      setMyAnswer(null);
      setReveal(null);
      setQuestionExpanded(false);
      setPhase("intro");
    });

    socket.on("game:answerBoard", (b) => {
      setBoard(b);
      setMyAnswer(null);
      setReveal(null);
      setQuestionExpanded(false);
      setNumberInput("");
      setWideNumber(false);
      setSequenceOrder([]);
      setWideSkipIndex(null);
      setPhase("question");
      setSecondsLeft(b.timeLimitSeconds);
    });

    socket.on("game:reveal", (data) => {
      setReveal(data);
      setPhase("reveal");
      setSecondsLeft(0);
    });

    socket.on("game:leaderboard", ({ standings, hasMore }) => {
      setStandings(standings);
      setHasMore(hasMore);
      setPhase("leaderboard");
      const mine = standings.find((p) => p.name === myName);
      if (mine) setMyScore(mine.score);
    });

    socket.on("game:ended", ({ standings }) => {
      setStandings(standings);
      setPhase("ended");
      clearPlayerSession();
    });

    socket.on("game:hostLeft", () => {
      clearPlayerSession();
      alert("The host ended the session.");
      navigate("/join");
    });

    return () => {
      socket.off("connect", resume);
      socket.off("game:questionIntro");
      socket.off("game:answerBoard");
      socket.off("game:reveal");
      socket.off("game:leaderboard");
      socket.off("game:ended");
      socket.off("game:hostLeft");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, myName, navigate]);

  useEffect(() => {
    if (phase !== "question") {
      clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tickRef.current);
  }, [phase]);

  function submitResponse(response) {
    if (myAnswer) return;
    socket.emit("player:submitAnswer", { code, response }, (res) => {
      if (res.ok) setMyAnswer(res.result);
    });
  }

  // Whether this question's type even offers Go Wide's second-pick mechanic.
  const supportsGoWidePicks =
    board?.roundType === "go_wide" && (board.type === "multiple_choice" || board.type === "normal");

  // Can this player still tap a second option? Only once they've already
  // submitted a first pick, the round is Go Wide, and they haven't gone wide yet.
  const canAddSecondPick = supportsGoWidePicks && !!myAnswer && !Array.isArray(myAnswer.given);

  // MC/Normal Go Wide: the first pick submits normally (full points); tapping
  // a second, different option afterward widens it for half points instead
  // of requiring a "go wide" mode to be chosen before answering at all.
  function addSecondPick(value) {
    if (!canAddSecondPick || isGivenValue(value)) return;
    socket.emit("player:addSecondPick", { code, pick: value }, (res) => {
      if (res.ok) setMyAnswer(res.result);
    });
  }

  function pressDigit(d) {
    if (myAnswer) return;
    if (d === "C") return setNumberInput("");
    if (d === "enter") {
      if (numberInput === "") return;
      return submitResponse({ number: Number(numberInput), wide: wideNumber });
    }
    setNumberInput((s) => (s.length >= 12 ? s : s + d));
  }

  // Go Wide on a Number question is one-way (select it, can't unselect) but
  // stays pressable even after submitting (in case the player second-guesses
  // themselves) — update locally and, once already submitted, tell the
  // server to recompute correctness/points.
  function setGoWideNumber(next) {
    setWideNumber(next);
    if (myAnswer) socket.emit("player:updateGoWide", { code, wide: next });
  }

  // Position (1-based) this item currently holds in the chosen order, or
  // null if it hasn't been tapped yet. Items stay put in their original
  // spot — only the overlaid number changes — so tapping never reflows
  // the list mid-answer.
  function sequencePosition(originalIndex) {
    const idx = sequenceOrder.findIndex((it) => it.originalIndex === originalIndex);
    return idx === -1 ? null : idx + 1;
  }

  // Deselecting a pick clears it and every pick made after it (not just
  // that one slot) — changing your mind on an earlier choice invalidates
  // whatever order you built on top of it.
  function toggleSequenceItem(item) {
    if (myAnswer) return;
    setSequenceOrder((order) => {
      const idx = order.findIndex((it) => it.originalIndex === item.originalIndex);
      if (idx === -1) return [...order, item];
      return order.slice(0, idx);
    });
  }

  function toggleWildcard(originalIndex) {
    if (myAnswer) return;
    setWideSkipIndex((cur) => (cur === originalIndex ? null : originalIndex));
  }

  function submitSequence() {
    submitResponse({ order: sequenceOrder.map((it) => it.originalIndex), wideSkipIndex });
  }

  const myStanding = standings.find((p) => p.name === myName);
  const myRank = standings.findIndex((p) => p.name === myName) + 1;
  const pictureUrl = intro?.pictureUrl || board?.pictureUrl;
  const questionText = intro?.text || board?.text;
  const roundBadge = board?.roundType && board.roundType !== "standard" ? ROUND_TYPE_LABELS[board.roundType] : null;

  // Was `value` part of what I actually submitted? (single value or, for a
  // Go Wide 2-pick, one of the two.) Used to highlight my own locked-in pick.
  function isGivenValue(value) {
    if (!myAnswer) return false;
    return Array.isArray(myAnswer.given) ? myAnswer.given.includes(value) : myAnswer.given === value;
  }

  const correctAnswerText =
    phase === "reveal" && reveal
      ? reveal.type === "multiple_choice"
        ? board.options[reveal.correctIndex]
        : reveal.type === "normal"
          ? reveal.answerText
          : reveal.type === "number"
            ? String(reveal.correctNumber)
            : reveal.type === "sequence"
              ? reveal.correctOrder.join(" → ")
              : ""
      : null;

  return (
    <div className="player-screen">
      {phase === "lobby" && (
        <div className="screen center">
          <h1 className="title">You're in!</h1>
          <p className="subtitle">{initialRoundName || "Waiting for the host to pick a round..."}</p>
          <p className="subtitle">Waiting for the host to start the quiz...</p>
        </div>
      )}

      {phase === "intro" && intro && (
        <div className="screen center">
          {pictureUrl && (
            <div className="picture-display">
              <img src={`${SERVER_URL}${pictureUrl}`} alt="" />
            </div>
          )}
          <h2 className="question-text">{intro.text}</h2>
          <p className="subtitle">Get ready — the answer board is coming up...</p>
        </div>
      )}

      {(phase === "question" || phase === "reveal") && board && (
        <>
          <div className="top-bar">
            <span className="top-bar-score">{myScore} pts</span>
            <span className="top-bar-progress">
              Q{board.index + 1}/{board.total}
            </span>
            <span className="top-bar-timer">{secondsLeft}s</span>
          </div>
          <div className="timer-track">
            <div
              className="timer-fill"
              style={{ width: `${(100 * secondsLeft) / board.timeLimitSeconds}%` }}
            />
          </div>
          {roundBadge && <div className="round-badge">{roundBadge} Round</div>}

          <button
            className={`question-panel ${questionExpanded ? "expanded" : ""}`}
            onClick={() => setQuestionExpanded((v) => !v)}
          >
            {pictureUrl && questionExpanded && (
              <div className="picture-display small">
                <img src={`${SERVER_URL}${pictureUrl}`} alt="" />
              </div>
            )}
            <p className={questionExpanded ? "question-text" : "question-text clamped"}>
              {phase === "reveal" ? correctAnswerText : questionText}
            </p>
            <span className="question-hint">{questionExpanded ? "Tap to collapse" : "Tap question to see more..."}</span>
          </button>

          {phase === "reveal" && (
            <p className={`subtitle center-text ${myAnswer?.isCorrect ? "correct-text" : "wrong-text"}`}>
              {myAnswer
                ? myAnswer.isCorrect
                  ? `Correct! +${myAnswer.points} points${
                      myAnswer.rank && myAnswer.rank <= 5 ? ` — ${ordinal(myAnswer.rank)} fastest!` : ""
                    }`
                  : myAnswer.points !== 0
                    ? `${myAnswer.points} points`
                    : "Not quite"
                : "Time's up!"}
            </p>
          )}

          <div className="answer-area">
            {canAddSecondPick && phase === "question" && (
              <p className="subtitle center-text go-wide-hint">
                🎯 Locked in! Tap another option to go wide for half points.
              </p>
            )}

            {board.type === "multiple_choice" ? (
              <div className="answer-list">
                {board.options.map((opt, i) => (
                  <button
                    className={`answer-row ${isGivenValue(i) ? "chosen" : ""} ${
                      phase === "reveal" && i === reveal.correctIndex ? "correct" : ""
                    }`}
                    key={i}
                    disabled={phase === "reveal" || (!!myAnswer && !(canAddSecondPick && !isGivenValue(i)))}
                    onClick={() => (myAnswer ? addSecondPick(i) : submitResponse({ optionIndex: i }))}
                  >
                    <span className="option-text">{opt}</span>
                  </button>
                ))}
              </div>
            ) : board.type === "normal" ? (
              <div className="letter-grid">
                {LETTER_TILES.map((tile) => {
                  const letters = tileLetters(tile);
                  const isChosen = letters.some((l) => isGivenValue(l));
                  const isCorrectTile = phase === "reveal" && letters.includes(reveal.correctLetter);
                  return (
                    <button
                      className={`letter-btn ${isChosen ? "chosen" : ""} ${isCorrectTile ? "correct" : ""}`}
                      key={tile}
                      disabled={phase === "reveal" || (!!myAnswer && !(canAddSecondPick && !isChosen))}
                      onClick={() => (myAnswer ? addSecondPick(letters[0]) : submitResponse({ letter: letters[0] }))}
                    >
                      {tile}
                    </button>
                  );
                })}
              </div>
            ) : board.type === "number" ? (
              myAnswer && phase === "question" ? (
                <div className="keypad-wrap">
                  <p className="subtitle center-text">Answer locked in. Waiting for others...</p>
                  {board.roundType === "go_wide" && (
                    <button
                      type="button"
                      className={`btn go-wide-toggle ${wideNumber ? "active" : ""}`}
                      disabled={wideNumber}
                      onClick={() => setGoWideNumber(true)}
                    >
                      {wideNumber ? "🎯 Go Wide (±1, half points) — selected" : "🎯 Go Wide (±1, half points)"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="keypad-wrap">
                  {phase === "question" && board.roundType === "go_wide" && (
                    <button
                      type="button"
                      className={`btn go-wide-toggle ${wideNumber ? "active" : ""}`}
                      disabled={wideNumber}
                      onClick={() => setGoWideNumber(true)}
                    >
                      {wideNumber ? "🎯 Go Wide (±1, half points) — selected" : "🎯 Go Wide (±1, half points)"}
                    </button>
                  )}
                  <div className={`keypad-display ${phase === "reveal" ? "correct" : ""}`}>
                    {phase === "reveal" ? reveal.correctNumber : numberInput || "Enter your answer"}
                  </div>
                  <div className="keypad-grid">
                    {KEYPAD_ROWS.flat().map((key) => (
                      <button
                        key={key}
                        className={`keypad-btn ${key === "enter" ? "keypad-enter" : ""} ${key === "C" ? "keypad-clear" : ""}`}
                        onClick={() => pressDigit(key)}
                        disabled={phase === "reveal" || (key === "enter" && numberInput === "")}
                      >
                        {key === "enter" ? "Enter" : key}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : board.type === "sequence" ? (
              myAnswer && phase === "question" ? (
                <p className="subtitle center-text">Answer locked in. Waiting for others...</p>
              ) : phase === "reveal" ? (
                <div className="sequence-wrap">
                  <p className="subtitle">Correct order:</p>
                  <div className="sequence-chosen">
                    {reveal.correctOrder.map((text, i) => (
                      <div className="sequence-chip-row" key={i}>
                        <span className="sequence-chip correct">
                          <span className="sequence-chip-num">{i + 1}</span>
                          <span className="sequence-chip-text">{text}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="sequence-wrap">
                  <p className="subtitle">Tap items in the correct order, then lock in:</p>
                  {board.roundType === "go_wide" && (
                    <p className="subtitle">
                      Tap ⚡ on one item to make it a wildcard — its position won't count against you (half points).
                    </p>
                  )}
                  <div className="sequence-options">
                    {board.items.map((item) => {
                      const position = sequencePosition(item.originalIndex);
                      return (
                        <div className="sequence-option-row" key={item.originalIndex}>
                          <button
                            type="button"
                            className={`sequence-option ${position ? "chosen" : ""}`}
                            onClick={() => toggleSequenceItem(item)}
                          >
                            {position && <span className="sequence-option-badge">{position}</span>}
                            <span className="sequence-option-text">{item.text}</span>
                          </button>
                          {board.roundType === "go_wide" && (
                            <button
                              type="button"
                              className={`btn btn-small go-wide-wildcard-btn ${wideSkipIndex === item.originalIndex ? "active" : ""}`}
                              onClick={() => toggleWildcard(item.originalIndex)}
                            >
                              ⚡
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="btn btn-primary btn-large"
                    onClick={submitSequence}
                    disabled={sequenceOrder.length !== board.items.length}
                  >
                    Lock in
                  </button>
                </div>
              )
            ) : null}
          </div>
        </>
      )}

      {phase === "leaderboard" && (
        <div className="screen center">
          <h2>{hasMore ? "Leaderboard" : "Round over!"}</h2>
          {myStanding && (
            <p className="subtitle">
              You're #{myRank} with {myStanding.score} points
            </p>
          )}
          <ol className="leaderboard">
            {standings.slice(0, 5).map((p, i) => (
              <li key={p.id} className={p.name === myName ? "me" : ""}>
                <span className="rank">#{i + 1}</span> {p.emoji} {p.name} <span className="score">{p.score}</span>
              </li>
            ))}
          </ol>
          <p className="subtitle">
            {hasMore ? "Next question coming up..." : "Waiting for the host to pick the next round..."}
          </p>
        </div>
      )}

      {phase === "ended" && (
        <div className="screen center">
          <h1 className="title">🏆 Final Results</h1>
          {myStanding && (
            <p className="subtitle">
              You finished #{myRank} with {myStanding.score} points
            </p>
          )}
          <ol className="leaderboard">
            {standings.map((p, i) => (
              <li key={p.id} className={p.name === myName ? "me" : ""}>
                <span className="rank">#{i + 1}</span> {p.emoji} {p.name} <span className="score">{p.score}</span>
              </li>
            ))}
          </ol>
          <button className="btn btn-primary" onClick={() => navigate("/join")}>
            Join another quiz
          </button>
        </div>
      )}
    </div>
  );
}
