/**
 * Regression test for the React-embed CSS scoping (upstream report:
 * @xtandard/flags/react/styles.css was a global unscoped Tailwind build that
 * restyled the whole host app): the kit's shared suite, with the flags scope,
 * plus the built stylesheet when it exists.
 *
 * @module
 */

import { readFile } from "node:fs/promises";
import { runEmbedCssSuite } from "@xtandard/kit/build";
import { describe, expect, it } from "vitest";

runEmbedCssSuite(
  { describe, it, expect },
  {
    scope: ".xtandard-flags",
    readBuiltCss: () => readFile("dist/react.css", "utf8").catch(() => undefined),
  },
);
