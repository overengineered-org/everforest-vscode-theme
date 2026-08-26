import assert from "node:assert/strict";
import test from "node:test";
import { createDocumentedWorkbenchColorContract } from "../../scripts/documented-workbench-color-contract.mjs";

const vscodeDocumentationCommit = "f194bdbad9448a5115b1219ed9fc3ba148e9aa7f";

function createThemeColorDocumentation(documentedColorCount = 900) {
  return Array.from({ length: documentedColorCount }, (_, colorIndex) => {
    const opacityRequirement = colorIndex === 42 ? " Color must not be opaque." : "";
    return `- \`surface.color${colorIndex}\`: Documented color ${colorIndex}.${opacityRequirement}`;
  }).join("\n");
}

test("extracts a pinned, ordered workbench color contract", () => {
  const themeColorDocumentation = [
    "- `invalid-color`: This is not a workbench color identifier.",
    createThemeColorDocumentation(),
  ].join("\n");

  const documentedWorkbenchColorContract = createDocumentedWorkbenchColorContract(
    themeColorDocumentation,
    vscodeDocumentationCommit
  );

  assert.equal(documentedWorkbenchColorContract.identifiers.length, 900);
  assert.equal(documentedWorkbenchColorContract.identifiers[0], "surface.color0");
  assert.equal(documentedWorkbenchColorContract.identifiers.at(-1), "surface.color899");
  assert.deepEqual(documentedWorkbenchColorContract.translucentIdentifiers, ["surface.color42"]);
  assert.equal(documentedWorkbenchColorContract.sourceCommit, vscodeDocumentationCommit);
  assert.equal(
    documentedWorkbenchColorContract.sourceUrl,
    `https://github.com/microsoft/vscode-docs/blob/${vscodeDocumentationCommit}/api/references/theme-color.md`
  );
});

test("rejects an unpinned VS Code documentation source", () => {
  assert.throws(
    () => createDocumentedWorkbenchColorContract(createThemeColorDocumentation(), "main"),
    /40 lowercase hexadecimal characters/
  );
});

test("rejects incomplete workbench color documentation", () => {
  assert.throws(
    () =>
      createDocumentedWorkbenchColorContract(
        createThemeColorDocumentation(899),
        vscodeDocumentationCommit
      ),
    /Expected at least 900 documented workbench colors, found 899/
  );
});

test("rejects duplicate workbench color identifiers", () => {
  const duplicateDocumentation = `${createThemeColorDocumentation()}\n- \`surface.color42\`: Duplicate.`;

  assert.throws(
    () => createDocumentedWorkbenchColorContract(duplicateDocumentation, vscodeDocumentationCommit),
    /duplicate workbench color identifiers/
  );
});
