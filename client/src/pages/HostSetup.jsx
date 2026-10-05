import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { socket } from "../lib/socket.js";
import { logout, listRounds } from "../lib/api.js";
import { useCurrentUser } from "../lib/useCurrentUser.js";

const RECENT_COUNT = 3;

export default function HostSetup() {
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [rounds, setRounds] = useState(null); // null = still loading
  const navigate = useNavigate();
  const { user, loading } = useCurrentUser();

  useEffect(() => {
    if (!user) return;
    listRounds()
      .then(setRounds)
      .catch(() => setRounds([]));
  }, [user]);

  function startGame() {
    setError("");
    setStarting(true);
    if (!socket.connected) socket.connect();
    socket.emit("host:createRoom", {}, (res) => {
      setStarting(false);
      if (res.ok) {
        navigate(`/host/room/${res.code}`);
      } else {
        setError(res.error);
      }
    });
  }

  async function onLogout() {
    await logout();
    if (socket.connected) socket.disconnect();
    navigate("/login");
  }

  if (loading) return null;

  if (!user) {
    return (
      <div className="screen center">
        <h1 className="title">Host a Quiz</h1>
        <p className="subtitle">Sign in to host a quiz or manage the Quiz Bank.</p>
        <div className="stack">
          <Link className="btn btn-primary btn-large" to="/login">
            Sign in
          </Link>
          <Link className="btn btn-link" to="/">
            Back
          </Link>
        </div>
      </div>
    );
  }

  const recentRounds = rounds
    ? [...rounds].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, RECENT_COUNT)
    : [];

  return (
    <div className="screen center setup-screen">
      <h1 className="title">🎮 Host a Quiz</h1>
      <p className="subtitle">Signed in as {user.name}</p>

      <div className="setup-panel">
        <div className="setup-stats">
          <div className="setup-stat">
            <span className="setup-stat-number">{rounds === null ? "–" : rounds.length}</span>
            <span className="setup-stat-label">rounds in your bank</span>
          </div>
        </div>

        {recentRounds.length > 0 && (
          <div className="setup-recent">
            <span className="setup-recent-label">Jump back into editing</span>
            <ul className="setup-recent-list">
              {recentRounds.map((r) => (
                <li key={r.id}>
                  <Link className="setup-recent-link" to={`/bank/${r.id}`}>
                    <span>
                      {r.visibility === "private" ? "🔒" : "🌐"} {r.name}
                    </span>
                    <span className="subtitle">{r.questionCount}Q</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {rounds?.length === 0 && (
          <p className="setup-note subtitle">Your bank is empty — add a round before you start a game.</p>
        )}
      </div>

      <p className="subtitle">
        Start a new game, then pick the first round from your Quiz Bank once you're in — and pick a fresh round
        (and round type) after every round, live.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="stack">
        <button className="btn btn-primary btn-large" onClick={startGame} disabled={starting}>
          {starting ? "Starting..." : "Start New Game"}
        </button>
        <Link className="btn" to="/bank">
          📚 Manage Quiz Bank
        </Link>
        <button className="btn btn-link" onClick={onLogout}>
          Sign out
        </button>
        <Link className="btn btn-link" to="/">
          Back
        </Link>
      </div>
    </div>
  );
}
