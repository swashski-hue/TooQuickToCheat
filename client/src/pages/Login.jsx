import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, signup } from "../lib/api.js";
import { socket } from "../lib/socket.js";

export default function Login() {
  const [mode, setMode] = useState("login"); // login | signup
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup({ name, password, inviteCode });
      } else {
        await login({ name, password });
      }
      // The socket may already be connected from an earlier, unauthenticated
      // visit — reconnect so its handshake picks up the fresh session cookie.
      if (socket.connected) {
        socket.disconnect();
        socket.connect();
      }
      navigate("/host");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen center">
      <h1 className="title">{mode === "signup" ? "Create account" : "Sign in"}</h1>
      <p className="subtitle">
        {mode === "signup"
          ? "You'll need an invite code from whoever's already using this install."
          : "Sign in to host a quiz or manage the Quiz Bank."}
      </p>
      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {mode === "signup" && (
          <label className="field">
            <span>Invite code</span>
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-large" type="submit" disabled={busy}>
          {busy ? "..." : mode === "signup" ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          className="btn btn-link"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError("");
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </div>
  );
}
