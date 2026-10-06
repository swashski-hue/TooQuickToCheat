import { Link } from "react-router-dom";
import { useCurrentUser } from "../lib/useCurrentUser.js";

export default function Home() {
  const { user, loading } = useCurrentUser();

  return (
    <div className="player-screen">
      <div className="screen center">
        <h1 className="title">⚡ Too Quick To Cheat</h1>
        <p className="subtitle">
          Host a quiz where the questions come so fast you don't have time to search up the answers.
        </p>
        {!loading && <p className="subtitle">{user ? `Signed in as ${user.name}` : "Not signed in"}</p>}
        <div className="stack">
          <Link className="btn btn-primary" to="/host">
            Host a quiz
          </Link>
          <Link className="btn" to="/join">
            Join a quiz
          </Link>
          <Link className="btn btn-link" to="/bank">
            📚 Manage Quiz Bank
          </Link>
          {!loading && !user && (
            <Link className="btn btn-link" to="/login">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
