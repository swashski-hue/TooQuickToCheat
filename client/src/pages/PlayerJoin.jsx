import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { socket } from "../lib/socket.js";
import { getPlayerEmojis } from "../lib/api.js";
import { savePlayerSession } from "../lib/playerSession.js";

export default function PlayerJoin() {
  const { code: codeFromUrl } = useParams();
  const [code, setCode] = useState(codeFromUrl || "");
  const [name, setName] = useState("");
  const [emojis, setEmojis] = useState([]);
  const [emoji, setEmoji] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getPlayerEmojis().then((list) => {
      setEmojis(list);
      if (list.length) setEmoji(list[0]);
    });
  }, []);

  function onJoin(e) {
    e.preventDefault();
    setError("");
    if (!code.trim() || !name.trim()) {
      setError("Enter the room code and your name.");
      return;
    }
    setJoining(true);
    if (!socket.connected) socket.connect();
    const roomCode = code.trim().toUpperCase();
    socket.emit("player:join", { code: roomCode, name, emoji }, (res) => {
      setJoining(false);
      if (res.ok) {
        savePlayerSession(roomCode, name);
        navigate(`/play/${roomCode}`, { state: { name, roundName: res.roundName } });
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="screen center">
      <h1 className="title">Join Quiz</h1>
      <form className="stack" onSubmit={onJoin}>
        <label className="field">
          <span>Room code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDE"
            maxLength={5}
            autoCapitalize="characters"
          />
        </label>
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nickname" maxLength={24} />
        </label>
        {emojis.length > 0 && (
          <div className="field">
            <span>Pick an emoji</span>
            <div className="emoji-picker">
              {emojis.map((e) => (
                <button
                  type="button"
                  key={e}
                  className={`emoji-picker-option ${emoji === e ? "selected" : ""}`}
                  onClick={() => setEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-large" type="submit" disabled={joining}>
          {joining ? "Joining..." : "Join"}
        </button>
      </form>
    </div>
  );
}
