import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createDocumentedWorkbenchColorContract } from "../../scripts/documented-workbench-color-contract.mjs";
import themeManifest from "../support/theme-manifest.cjs";

const vscodeDocumentationCommit = "f194bdbad9448a5115b1219ed9fc3ba148e9aa7f";
const repositoryDirectory = resolve(import.meta.dirname, "../..");
const extensionSpecificWorkbenchColorIdentifiers = [
  "gitlens.gutterBackgroundColor",
  "gitlens.gutterForegroundColor",
  "gitlens.gutterUncommittedForegroundColor",
  "gitlens.trailingLineForegroundColor",
  "gitlens.lineHighlightBackgroundColor",
  "gitlens.lineHighlightOverviewRulerColor",
  "gitlens.closedPullRequestIconColor",
  "gitlens.openPullRequestIconColor",
  "gitlens.mergedPullRequestIconColor",
  "gitlens.unpublishedChangesIconColor",
  "gitlens.unpublishedCommitIconColor",
  "gitlens.unpulledChangesIconColor",
  "gitlens.decorations.addedForegroundColor",
  "gitlens.decorations.copiedForegroundColor",
  "gitlens.decorations.deletedForegroundColor",
  "gitlens.decorations.ignoredForegroundColor",
  "gitlens.decorations.modifiedForegroundColor",
  "gitlens.decorations.untrackedForegroundColor",
  "gitlens.decorations.renamedForegroundColor",
  "gitlens.decorations.branchAheadForegroundColor",
  "gitlens.decorations.branchBehindForegroundColor",
  "gitlens.decorations.branchDivergedForegroundColor",
  "gitlens.decorations.branchUpToDateForegroundColor",
  "gitlens.decorations.branchUnpublishedForegroundColor",
  "gitlens.decorations.branchMissingUpstreamForegroundColor",
  "issues.open",
  "issues.closed",
];

function createThemeColorDocumentation(documentedColorCount = 910) {
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

  assert.equal(documentedWorkbenchColorContract.identifiers.length, 910);
  assert.equal(documentedWorkbenchColorContract.identifiers[0], "surface.color0");
  assert.equal(documentedWorkbenchColorContract.identifiers.at(-1), "surface.color909");
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
    /found 899/
  );
});

test("rejects duplicate workbench color identifiers", () => {
  const duplicateDocumentation = `${createThemeColorDocumentation()}\n- \`surface.color42\`: Duplicate.`;

  assert.throws(
    () => createDocumentedWorkbenchColorContract(duplicateDocumentation, vscodeDocumentationCommit),
    /duplicate workbench color identifiers/
  );
});

test("ships the exact documented and extension-specific workbench color set", () => {
  const documentedWorkbenchColorContract = JSON.parse(
    readFileSync(
      resolve(repositoryDirectory, "src/workbench/documented-workbench-colors.json"),
      "utf8"
    )
  );
  const expectedWorkbenchColorIdentifiers = new Set([
    ...documentedWorkbenchColorContract.identifiers,
    ...extensionSpecificWorkbenchColorIdentifiers,
  ]);

  assert.equal(documentedWorkbenchColorContract.identifiers.length, 910);
  assert.equal(extensionSpecificWorkbenchColorIdentifiers.length, 27);
  assert.equal(expectedWorkbenchColorIdentifiers.size, 937);

  for (const themeContribution of themeManifest.expectedThemeContributions) {
    const generatedTheme = JSON.parse(
      readFileSync(resolve(repositoryDirectory, themeContribution.path), "utf8")
    );
    assert.deepEqual(
      new Set(Object.keys(generatedTheme.colors)),
      expectedWorkbenchColorIdentifiers,
      themeContribution.label
    );
  }
});
