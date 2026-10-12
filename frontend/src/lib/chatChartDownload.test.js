import { test } from "node:test";
import assert from "node:assert/strict";

import { chatChartFilename } from "./chatChartDownload.js";

test("chatChartFilename builds a safe image/pdf filename", () => {
  assert.equal(
    chatChartFilename("abc-123", "png"),
    "jk-agent-plot-abc-123.png",
  );
  assert.equal(
    chatChartFilename("weird / result:name", "pdf"),
    "jk-agent-plot-weird-result-name.pdf",
  );
  assert.equal(chatChartFilename("", "png"), "jk-agent-plot.png");
});
