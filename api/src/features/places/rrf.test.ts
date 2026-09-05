import { describe, expect, it } from "vitest";

import { reciprocalRankFusion } from "./rrf";

describe("reciprocalRankFusion", () => {
  it("ranks an item appearing in both legs above one appearing in only one", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    const result = reciprocalRankFusion(
      [
        [a, b],
        [b, c],
      ],
      10,
    );
    expect(result[0]!.id).toBe("b");
  });

  it("keeps a single-leg item's own rank order", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const result = reciprocalRankFusion([[a, b]], 10);
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("dedupes an item appearing in multiple legs into one result", () => {
    const a = { id: "a" };
    const result = reciprocalRankFusion([[a], [{ id: "a" }]], 10);
    expect(result).toHaveLength(1);
  });

  it("truncates to limit", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));
    const result = reciprocalRankFusion([items], 2);
    expect(result).toHaveLength(2);
  });

  it("returns [] for empty legs", () => {
    expect(reciprocalRankFusion([[], []], 10)).toEqual([]);
  });
});
