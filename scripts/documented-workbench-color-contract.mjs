const documentedWorkbenchColorIdentifierPattern =
  /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/;
const vscodeCommitPattern = /^[0-9a-f]{40}$/;

export function createDocumentedWorkbenchColorContract(
  themeColorDocumentation,
  vscodeDocumentationCommit
) {
  if (!vscodeCommitPattern.test(vscodeDocumentationCommit)) {
    throw new Error("VS Code documentation commit must be 40 lowercase hexadecimal characters");
  }

  const documentedColorEntries = [
    ...themeColorDocumentation.matchAll(/^\s*[-*]\s+`([^`]+)`:(.*)$/gm),
  ]
    .map(([, identifier, description]) => ({ identifier, description }))
    .filter(({ identifier }) => documentedWorkbenchColorIdentifierPattern.test(identifier));
  const documentedWorkbenchColorIdentifiers = documentedColorEntries.map(
    ({ identifier }) => identifier
  );
  const uniqueDocumentedWorkbenchColorIdentifiers = new Set(documentedWorkbenchColorIdentifiers);

  if (documentedWorkbenchColorIdentifiers.length < 900) {
    throw new Error(
      `Expected at least 900 documented workbench colors, found ${documentedWorkbenchColorIdentifiers.length}`
    );
  }
  if (
    uniqueDocumentedWorkbenchColorIdentifiers.size !== documentedWorkbenchColorIdentifiers.length
  ) {
    throw new Error("Theme color documentation contains duplicate workbench color identifiers");
  }

  return {
    sourceCommit: vscodeDocumentationCommit,
    sourceUrl: `https://github.com/microsoft/vscode-docs/blob/${vscodeDocumentationCommit}/api/references/theme-color.md`,
    identifiers: documentedWorkbenchColorIdentifiers,
    translucentIdentifiers: documentedColorEntries
      .filter(({ description }) => description.includes("must not be opaque"))
      .map(({ identifier }) => identifier),
  };
}
