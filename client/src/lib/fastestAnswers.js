// Shared by HostRoom and PresentationScreen: given a reveal payload's
// `results` array, rank the players who got the question correct by
// (rank ?? Infinity, then elapsedMs) — matches the scoring order used for
// RANK_BONUS in gameManager.js.
export function getFastestCorrect(results) {
  if (!results) return [];
  const correct = results.filter((r) => r.answer?.isCorrect);
  return correct.sort((a, b) => {
    const ra = a.answer.rank ?? Infinity;
    const rb = b.answer.rank ?? Infinity;
    if (ra !== rb) return ra - rb;
    return a.answer.elapsedMs - b.answer.elapsedMs;
  });
}
