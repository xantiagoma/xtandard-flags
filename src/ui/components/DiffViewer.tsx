import React, { useMemo } from "react";
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import { generateDiffFile } from "@git-diff-view/file";
import "@git-diff-view/react/styles/diff-view.css";

/**
 * Side-by-side (or unified) text diff of two JSON blobs, via `@git-diff-view/react`.
 * Default-exported so it can be `React.lazy`-loaded — the highlighter is heavy, so
 * it only loads when the user opens the diff tab.
 */
export default function DiffViewer({
  before,
  after,
  mode = "unified",
  theme = "light",
}: {
  before: string;
  after: string;
  mode?: "split" | "unified";
  theme?: "light" | "dark";
}) {
  const file = useMemo(() => {
    const f = generateDiffFile("published.json", before, "draft.json", after, "json", "json");
    f.initRaw();
    // Expand all collapsed regions up front — no "click to expand" friction.
    f.onAllExpand(mode === "split" ? "split" : "unified");
    return f;
  }, [before, after, mode]);

  // Bounded height with its own scroll, so expanding the diff doesn't grow the modal.
  return (
    <div className="max-h-[55vh] overflow-auto rounded-md border border-border text-[12px]">
      <DiffView
        diffFile={file}
        diffViewMode={mode === "split" ? DiffModeEnum.Split : DiffModeEnum.Unified}
        diffViewTheme={theme}
        diffViewHighlight
        diffViewWrap
      />
    </div>
  );
}
