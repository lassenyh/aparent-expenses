import assert from "node:assert/strict";
import test from "node:test";

import { mergeReceipts } from "../src/lib/mergeReceipts.ts";

const ids = (list) => list.map((r) => r.id);

test("an older upload snapshot does not drop a receipt a newer one added", () => {
  const afterB = mergeReceipts([], [{ id: "a" }, { id: "b" }], new Set());
  const afterStaleA = mergeReceipts(afterB, [{ id: "a" }], new Set());
  assert.deepEqual(ids(afterStaleA), ["a", "b"]);
});

test("a late snapshot does not bring back a receipt the user deleted", () => {
  const merged = mergeReceipts([{ id: "a" }], [{ id: "a" }, { id: "b" }], new Set(["a"]));
  assert.deepEqual(ids(merged), ["b"]);
});

test("server order wins and fields come from the snapshot", () => {
  const merged = mergeReceipts(
    [{ id: "b", name: "old" }],
    [{ id: "a", name: "A" }, { id: "b", name: "new" }],
    new Set(),
  );
  assert.deepEqual(merged, [{ id: "a", name: "A" }, { id: "b", name: "new" }]);
});
