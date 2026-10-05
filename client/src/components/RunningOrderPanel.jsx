import { ROUND_TYPE_LABELS } from "../lib/roundTypes.js";
import { socket } from "../lib/socket.js";

export default function RunningOrderPanel({ code, queue, onAddRound }) {
  function remove(entryId) {
    socket.emit("host:queueRemove", { code, entryId });
  }

  function move(entryId, direction) {
    socket.emit("host:queueReorder", { code, entryId, direction });
  }

  return (
    <div className="host-sidebar-section">
      <span className="host-sidebar-label">Running order</span>
      {queue.length === 0 && <p className="subtitle">Nothing queued yet.</p>}
      <ul className="running-order-list">
        {queue.map((entry, i) => (
          <li key={entry.id} className="running-order-item">
            <div className="running-order-item-info">
              <strong>
                {entry.visibility === "private" ? "🔒 " : "🌐 "}
                {entry.roundName}
              </strong>
              <span className="round-type-pill small">{ROUND_TYPE_LABELS[entry.roundType]}</span>
              <span className="subtitle">{entry.questionCount} questions</span>
            </div>
            <div className="running-order-item-controls">
              <button className="btn btn-small" onClick={() => move(entry.id, -1)} disabled={i === 0}>
                ↑
              </button>
              <button className="btn btn-small" onClick={() => move(entry.id, 1)} disabled={i === queue.length - 1}>
                ↓
              </button>
              <button className="btn btn-small btn-danger" onClick={() => remove(entry.id)}>
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button className="btn btn-small" onClick={onAddRound}>
        + Add round
      </button>
    </div>
  );
}
