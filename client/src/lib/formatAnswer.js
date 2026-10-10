// Renders a player's raw `given` answer (shape depends on question type —
// see gameManager.js's submitAnswer) into something a host can read at a
// glance, including the Go Wide double-pick shapes.
export function formatGivenAnswer(type, given, board) {
  if (given === null || given === undefined || given === "") return "No answer";

  if (type === "multiple_choice") {
    if (Array.isArray(given)) return given.map((i) => board?.options?.[i] ?? "?").join(" + ");
    return board?.options?.[given] ?? "?";
  }
  if (type === "normal") {
    if (Array.isArray(given)) return given.filter(Boolean).join(" / ") || "No answer";
    return given;
  }
  if (type === "number") {
    return Number.isNaN(given) ? "No answer" : String(given);
  }
  if (type === "sequence") {
    if (!Array.isArray(given)) return "No answer";
    return given.map((originalIndex) => board?.items?.find((it) => it.originalIndex === originalIndex)?.text ?? "?").join(" → ");
  }
  return String(given);
}
