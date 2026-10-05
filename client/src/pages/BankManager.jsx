import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listRounds, deleteRound } from "../lib/api.js";
import { formatDate } from "../lib/formatDate.js";
import { useCurrentUser } from "../lib/useCurrentUser.js";

const COLUMNS = [
  { key: "name", label: "Name", type: "text" },
  { key: "visibility", label: "Visibility", type: "text" },
  { key: "questionCount", label: "Questions", type: "number" },
  { key: "createdBy", label: "Created by", type: "text" },
  { key: "createdAt", label: "Created", type: "date" },
  { key: "timesUsed", label: "Times used", type: "number" },
];

const DEFAULT_SORT_DIR = { questionCount: "desc", createdAt: "desc", timesUsed: "desc" };

function compareRounds(a, b, key, type) {
  if (type === "text") return (a[key] || "").localeCompare(b[key] || "");
  if (type === "date") return new Date(a[key] || 0) - new Date(b[key] || 0);
  return (a[key] || 0) - (b[key] || 0);
}

export default function BankManager() {
  const [rounds, setRounds] = useState([]);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  const { user, loading } = useCurrentUser();

  useEffect(() => {
    if (user) refresh();
  }, [user]);

  function refresh() {
    listRounds().then(setRounds).catch((e) => setError(e.message));
  }

  async function onDelete(id) {
    if (!confirm("Delete this round from the bank?")) return;
    await deleteRound(id);
    refresh();
  }

  function onSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_SORT_DIR[key] || "asc");
    }
  }

  if (loading) return null;

  if (!user) {
    return (
      <div className="screen center">
        <h1 className="title">Quiz Bank</h1>
        <p className="subtitle">Sign in to view and build rounds.</p>
        <Link className="btn btn-primary" to="/login">
          Sign in
        </Link>
      </div>
    );
  }

  const sortCol = COLUMNS.find((c) => c.key === sortKey);
  const sortedRounds = [...rounds].sort((a, b) => {
    const cmp = compareRounds(a, b, sortKey, sortCol.type);
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="screen bank-screen">
      <h1 className="title">Quiz Bank</h1>
      <p className="subtitle">
        Build up rounds of up to 10 questions here. Public rounds are shared with everyone; private rounds are only
        visible to you. When hosting, you'll pick rounds from this bank live, round by round.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="bank-table-wrap">
        <table className="bank-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} onClick={() => onSort(col.key)}>
                  {col.label}
                  {sortKey === col.key && (
                    <span className="bank-table-sort-arrow">{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRounds.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.visibility === "private" ? "🔒 Private" : "🌐 Public"}</td>
                <td>{r.questionCount}</td>
                <td>{r.createdBy || "Unknown"}</td>
                <td>{r.createdAt ? formatDate(r.createdAt) : "—"}</td>
                <td>{r.timesUsed ?? 0}</td>
                <td className="bank-table-actions">
                  <Link className="btn btn-small" to={`/bank/${r.id}`}>
                    Edit
                  </Link>
                  <button className="btn btn-small btn-danger" onClick={() => onDelete(r.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rounds.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="subtitle">
                  No rounds yet — create one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="stack">
        <Link className="btn btn-primary" to="/bank/new">
          + New round
        </Link>
        <Link className="btn btn-link" to="/host">
          Back
        </Link>
      </div>
    </div>
  );
}
