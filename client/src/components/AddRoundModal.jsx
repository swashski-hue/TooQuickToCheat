import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listRounds, getRound, getRoundTypes } from "../lib/api.js";
import { formatDate } from "../lib/formatDate.js";
import { QUESTION_TYPE_LABELS } from "../lib/questionTypes.js";
import { socket } from "../lib/socket.js";

export default function AddRoundModal({ code, onClose }) {
  const [rounds, setRounds] = useState([]);
  const [roundTypes, setRoundTypes] = useState({});
  const [roundId, setRoundId] = useState("");
  const [roundDetail, setRoundDetail] = useState(null); // full round, fetched on selection
  const [roundType, setRoundType] = useState("standard");
  const [creatorFilter, setCreatorFilter] = useState(""); // "" = everyone
  const [sortDir, setSortDir] = useState("desc"); // by createdAt; desc = newest first
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listRounds().then((rs) => {
      setRounds(rs);
      if (rs.length) setRoundId(rs[0].id);
    });
    getRoundTypes().then(setRoundTypes);
  }, []);

  useEffect(() => {
    if (!roundId) return setRoundDetail(null);
    getRound(roundId).then(setRoundDetail);
  }, [roundId]);

  const creators = [...new Set(rounds.map((r) => r.createdBy || "Unknown"))].sort();

  const visibleRounds = rounds
    .filter((r) => !creatorFilter || (r.createdBy || "Unknown") === creatorFilter)
    .slice()
    .sort((a, b) => {
      const cmp = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      return sortDir === "asc" ? cmp : -cmp;
    });

  // Keep the selection valid whenever the filter/sort changes the visible set.
  useEffect(() => {
    if (visibleRounds.length && !visibleRounds.some((r) => r.id === roundId)) {
      setRoundId(visibleRounds[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorFilter, sortDir, rounds]);

  function confirm() {
    if (!roundId) return setError("Pick a round from the bank first.");
    setError("");
    setLoading(true);
    socket.emit("host:queueAdd", { code, roundId, roundType }, (res) => {
      setLoading(false);
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add round to running order</h2>
          <button className="btn btn-small btn-link" onClick={onClose}>
            ✕
          </button>
        </div>

        {rounds.length === 0 ? (
          <>
            <p className="subtitle">Your Quiz Bank is empty — add a round first.</p>
            <Link className="btn btn-primary" to="/bank/new" target="_blank">
              + New round
            </Link>
          </>
        ) : (
          <>
            {error && <p className="error">{error}</p>}

            <div className="field">
              <span>Round</span>

              <div className="round-picker-toolbar">
                <label className="round-picker-filter">
                  <span>Created by</span>
                  <select value={creatorFilter} onChange={(e) => setCreatorFilter(e.target.value)}>
                    <option value="">Everyone</option>
                    {creators.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                >
                  Created {sortDir === "asc" ? "▲ oldest first" : "▼ newest first"}
                </button>
              </div>

              <div className="round-picker-list">
                {visibleRounds.map((r) => (
                  <button
                    key={r.id}
                    className={`round-picker-item ${roundId === r.id ? "selected" : ""}`}
                    onClick={() => setRoundId(r.id)}
                  >
                    <div className="round-picker-item-main">
                      <strong>
                        {r.visibility === "private" ? "🔒 " : "🌐 "}
                        {r.name}
                      </strong>
                      <span className="subtitle">
                        {r.questionCount} questions · by {r.createdBy || "Unknown"}
                        {r.createdAt && ` · ${formatDate(r.createdAt)}`}
                      </span>
                    </div>
                    <span className={`round-picker-usage ${r.timesUsed ? "" : "unused"}`}>
                      {r.timesUsed ? `Used ${r.timesUsed}×` : "Never used"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {roundDetail && (
              <div className="round-detail">
                <span className="host-sidebar-label">Contents</span>
                <ol className="round-question-preview">
                  {roundDetail.questions.map((q, i) => (
                    <li key={q.id || i}>
                      <span className="round-question-type">{QUESTION_TYPE_LABELS[q.type]}</span>
                      {q.text || <em>(no question text)</em>}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="round-type-grid">
              {Object.entries(roundTypes).map(([value, t]) => (
                <button
                  key={value}
                  className={`round-type-card ${roundType === value ? "selected" : ""}`}
                  onClick={() => setRoundType(value)}
                >
                  <strong>{t.label}</strong>
                  <span>{t.description}</span>
                </button>
              ))}
            </div>

            <button className="btn btn-primary btn-large" onClick={confirm} disabled={loading}>
              {loading ? "Adding..." : "+ Add to Running Order"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
