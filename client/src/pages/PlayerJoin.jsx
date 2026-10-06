import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { socket } from "../lib/socket.js";
import { savePlayerSession } from "../lib/playerSession.js";

// Mirrors server/gameManager.js's PLAYER_EMOJIS — kept as a plain constant
// (not fetched) so the picker is always there immediately, with no dependency
// on a network round-trip succeeding before a player can make a choice.
const EMOJIS = [
  "🦄", "🐸", "🐵", "🦊",
  "🐼", "🐨", "🦁", "🐯",
  "🐶", "🐱", "🐹", "🐰",
  "🦉", "🐙", "🦀", "🤖",
];

export default function PlayerJoin() {
  const { code: codeFromUrl } = useParams();
  const [step, setStep] = useState("code"); // "code" | "details"
  const [code, setCode] = useState(codeFromUrl || "");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [takenEmojis, setTakenEmojis] = useState([]);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();

  function onCheckRoom(e) {
    e.preventDefault();
    setError("");
    if (!code.trim()) {
      setError("Enter the room code.");
      return;
    }
    setChecking(true);
    if (!socket.connected) socket.connect();
    const roomCode = code.trim().toUpperCase();
    socket.emit("player:checkRoom", { code: roomCode }, (res) => {
      setChecking(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const taken = res.takenEmojis || [];
      setTakenEmojis(taken);
      setEmoji((current) => (taken.includes(current) ? EMOJIS.find((e) => !taken.includes(e)) || current : current));
      setStep("details");
    });
  }

  function onJoin(e) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    setJoining(true);
    const roomCode = code.trim().toUpperCase();
    socket.emit("player:join", { code: roomCode, name, emoji }, (res) => {
      setJoining(false);
      if (res.ok) {
        savePlayerSession(roomCode, name, emoji);
        navigate(`/play/${roomCode}`, { state: { name, emoji, roundName: res.roundName } });
      } else {
        setError(res.error);
        // Someone may have just taken this emoji — refresh the taken list.
        socket.emit("player:checkRoom", { code: roomCode }, (checkRes) => {
          if (checkRes.ok) setTakenEmojis(checkRes.takenEmojis || []);
        });
      }
    });
  }

  if (step === "code") {
    return (
      <div className="screen center">
        <h1 className="title">Join Quiz</h1>
        <form className="stack" onSubmit={onCheckRoom}>
          <label className="field">
            <span>Room code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCDE"
              maxLength={5}
              autoCapitalize="characters"
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-large" type="submit" disabled={checking}>
            {checking ? "Checking..." : "Continue"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="screen center">
      <h1 className="title">You're in room {code.trim().toUpperCase()}</h1>
      <form className="stack" onSubmit={onJoin}>
        <label className="field">
          <span>Team / player name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nickname" maxLength={24} autoFocus />
        </label>
        <div className="field">
          <span>Pick an emoji</span>
          <div className="emoji-picker">
            {EMOJIS.map((e) => {
              const isTaken = takenEmojis.includes(e) && e !== emoji;
              return (
                <button
                  type="button"
                  key={e}
                  className={`emoji-picker-option ${emoji === e ? "selected" : ""} ${isTaken ? "taken" : ""}`}
                  onClick={() => !isTaken && setEmoji(e)}
                  disabled={isTaken}
                  title={isTaken ? "Already taken in this room" : ""}
                >
                  {e}
                </button>
              );
            })}
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <button
          className="btn btn-link"
          type="button"
          onClick={() => {
            setStep("code");
            setError("");
          }}
        >
          Back
        </button>
        <button className="btn btn-primary btn-large" type="submit" disabled={joining}>
          {joining ? "Joining..." : "Join"}
        </button>
      </form>
    </div>
  );
}
