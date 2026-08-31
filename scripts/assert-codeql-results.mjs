import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const requiredCodeqlResultFileNames = ["actions.sarif", "javascript-typescript.sarif"];

export function collectUnsuppressedCodeqlFindings(codeqlSarifDocuments) {
  return codeqlSarifDocuments.flatMap((codeqlSarifDocument) =>
    (codeqlSarifDocument.runs ?? []).flatMap((codeqlRun) =>
      (codeqlRun.results ?? [])
        .filter((codeqlFinding) => (codeqlFinding.suppressions ?? []).length === 0)
        .map((codeqlFinding) => ({
          message: codeqlFinding.message?.text ?? "CodeQL finding without a message",
          ruleIdentifier: codeqlFinding.ruleId ?? "unknown-rule",
          sourceLocation:
            codeqlFinding.locations?.[0]?.physicalLocation?.artifactLocation?.uri ??
            "unknown-location",
        }))
    )
  );
}

function assertCodeqlResults(codeqlResultsDirectory) {
  const missingCodeqlResultFileNames = requiredCodeqlResultFileNames.filter(
    (codeqlResultFileName) => {
      try {
        readFileSync(resolve(codeqlResultsDirectory, codeqlResultFileName));
        return false;
      } catch (error) {
        if (error.code === "ENOENT") {
          return true;
        }
        throw error;
      }
    }
  );
  if (missingCodeqlResultFileNames.length > 0) {
    throw new Error(
      `Missing required CodeQL SARIF result file(s) in ${codeqlResultsDirectory}: ${missingCodeqlResultFileNames.join(", ")}`
    );
  }

  const codeqlSarifDocuments = requiredCodeqlResultFileNames.map((codeqlResultFileName) =>
    JSON.parse(readFileSync(resolve(codeqlResultsDirectory, codeqlResultFileName), "utf8"))
  );
  const unsuppressedCodeqlFindings = collectUnsuppressedCodeqlFindings(codeqlSarifDocuments);

  if (unsuppressedCodeqlFindings.length > 0) {
    const findingSummary = unsuppressedCodeqlFindings
      .slice(0, 20)
      .map(
        ({ message, ruleIdentifier, sourceLocation }) =>
          `${ruleIdentifier} at ${sourceLocation}: ${message}`
      )
      .join("\n");
    throw new Error(
      `CodeQL found ${unsuppressedCodeqlFindings.length} unsuppressed alert(s):\n${findingSummary}`
    );
  }

  console.log(
    `CodeQL passed across ${requiredCodeqlResultFileNames.length} required SARIF result files.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const codeqlResultsDirectory = process.argv[2];
  if (!codeqlResultsDirectory) {
    throw new Error("Usage: node scripts/assert-codeql-results.mjs <results-directory>");
  }
  assertCodeqlResults(resolve(codeqlResultsDirectory));
}
