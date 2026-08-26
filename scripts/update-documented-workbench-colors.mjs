import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDocumentedWorkbenchColorContract } from "./documented-workbench-color-contract.mjs";

const [themeColorDocumentationPath, vscodeDocumentationCommit] = process.argv.slice(2);

if (!themeColorDocumentationPath || !/^[0-9a-f]{40}$/.test(vscodeDocumentationCommit ?? "")) {
  throw new Error(
    "Usage: node scripts/update-documented-workbench-colors.mjs <theme-color.md> <40-character-commit>"
  );
}

const themeColorDocumentation = readFileSync(resolve(themeColorDocumentationPath), "utf8");
const documentedWorkbenchColorContract = createDocumentedWorkbenchColorContract(
  themeColorDocumentation,
  vscodeDocumentationCommit
);
const documentedWorkbenchColorContractPath = resolve(
  "src",
  "workbench",
  "documented-workbench-colors.json"
);

writeFileSync(
  documentedWorkbenchColorContractPath,
  `${JSON.stringify(documentedWorkbenchColorContract, null, 2)}\n`,
  "utf8"
);

console.log(
  `Recorded ${documentedWorkbenchColorContract.identifiers.length} documented workbench colors from ${vscodeDocumentationCommit}.`
);
