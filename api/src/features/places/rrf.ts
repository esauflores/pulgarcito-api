// Reciprocal Rank Fusion: score = Σ 1/(k+rank). k=60 is the standard constant
// from Cormack et al.; it damps the weight of low-ranked hits so an item
// ranking high in either leg still surfaces near the top of the merge.
const RRF_K = 60;

export function reciprocalRankFusion<T extends { id: string }>(legs: T[][], limit: number): T[] {
  const scores = new Map<string, number>();
  const byId = new Map<string, T>();

  for (const leg of legs) {
    leg.forEach((item, rank) => {
      scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (RRF_K + rank + 1));
      if (!byId.has(item.id)) byId.set(item.id, item);
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => byId.get(id)!);
}
