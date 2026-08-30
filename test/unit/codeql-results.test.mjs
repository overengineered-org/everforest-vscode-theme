import assert from "node:assert/strict";
import test from "node:test";
import { collectUnsuppressedCodeqlFindings } from "../../scripts/assert-codeql-results.mjs";

test("collects only unsuppressed CodeQL findings", () => {
  const codeqlFindings = collectUnsuppressedCodeqlFindings([
    {
      runs: [
        {
          results: [
            {
              ruleId: "js/example",
              message: { text: "Unsuppressed finding" },
              locations: [{ physicalLocation: { artifactLocation: { uri: "src/extension.ts" } } }],
            },
            {
              ruleId: "js/suppressed",
              message: { text: "Accepted finding" },
              suppressions: [{ kind: "external" }],
            },
          ],
        },
      ],
    },
  ]);

  assert.deepEqual(codeqlFindings, [
    {
      message: "Unsuppressed finding",
      ruleIdentifier: "js/example",
      sourceLocation: "src/extension.ts",
    },
  ]);
});

test("handles empty CodeQL runs", () => {
  assert.deepEqual(collectUnsuppressedCodeqlFindings([{ runs: [] }]), []);
  assert.deepEqual(collectUnsuppressedCodeqlFindings([{}]), []);
});
