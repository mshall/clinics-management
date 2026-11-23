import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, useState } from "react";
import { renderToString } from "react-dom/server";
import { useSyncOnChange } from "./use-sync-on-change";

describe("useSyncOnChange", () => {
  it("runs sync on first render by default and renders the adjusted state in one pass", () => {
    let renders = 0;
    function Probe({ source }: { source: string }) {
      renders += 1;
      const [draft, setDraft] = useState("");
      useSyncOnChange([source], () => setDraft(source.toUpperCase()));
      return createElement("span", null, draft);
    }
    const html = renderToString(createElement(Probe, { source: "abc" }));
    assert.match(html, />ABC</);
    assert.ok(renders <= 3, `settles without looping (renders=${renders})`);
  });

  it("skips the first render with skipMount", () => {
    function Probe() {
      const [draft, setDraft] = useState("initial");
      useSyncOnChange(["x"], () => setDraft("synced"), { skipMount: true });
      return createElement("span", null, draft);
    }
    assert.match(renderToString(createElement(Probe)), />initial</);
  });

  it("is idempotent when the sync body writes state that appears in deps", () => {
    function Probe() {
      const [seed, setSeed] = useState("");
      useSyncOnChange([seed], () => {
        if (seed !== "done") setSeed("done");
      });
      return createElement("span", null, seed);
    }
    assert.match(renderToString(createElement(Probe)), />done</);
  });
});
