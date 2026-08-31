import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  createThemeGenerationSnapshot,
  synchronizeThemeFiles,
} from "../../dist/theme-regeneration.js";
import themeManifest from "../support/theme-manifest.cjs";

const { expectedThemeContributions } = themeManifest;
const expectedDocumentedWorkbenchColorCount = 910;
const expectedGeneratedThemeColorCount = 937;
const performanceSampleCount = 5;
const themeParsingIterationsPerSample = 50;
const minimumThemeParsingMebibytesPerSecond = 50;
const maximumGeneratedThemeBytes = 102 * 1_024;
const maximumAllGeneratedThemesBytes = 816 * 1_024;
const maximumColdGenerationCheckMilliseconds =
  process.env.EVERFOREST_EMULATED_RUNNER === "1" ? 2_000 : 1_000;
const currentFingerprintActivationIterations = 1_000;
const currentThemeGenerationSnapshot = createThemeGenerationSnapshot(
  "1.5.0",
  {
    appearance: "dark",
    contrast: "medium",
    workbenchStyle: "material",
    cursorColor: "white",
    selectionColor: "grey",
    italicKeywords: false,
    italicComments: true,
    diagnosticTextBackgroundOpacity: "0%",
    highContrast: false,
  },
  {
    appearance: "light",
    contrast: "medium",
    workbenchStyle: "material",
    cursorColor: "black",
    selectionColor: "grey",
    italicKeywords: false,
    italicComments: true,
    diagnosticTextBackgroundOpacity: "0%",
    highContrast: false,
  }
);

const generatedThemeArtifacts = expectedThemeContributions.map((themeContribution) => {
  const generatedThemePath = resolve(themeContribution.path.replace(/^\.\//, ""));
  const generatedThemeJson = readFileSync(generatedThemePath, "utf8");
  return {
    generatedThemeBytes: Buffer.byteLength(generatedThemeJson),
    generatedThemeJson,
    generatedThemePath,
  };
});

function median(measurements) {
  const sortedMeasurements = [...measurements].sort(
    (firstMeasurement, secondMeasurement) => firstMeasurement - secondMeasurement
  );
  return sortedMeasurements[Math.floor(sortedMeasurements.length / 2)];
}

test("keeps shipped theme payloads lean and fast to parse", (testingContext) => {
  assert.equal(generatedThemeArtifacts.length, 8, "benchmark must cover every shipped theme");
  const documentedWorkbenchColorContract = JSON.parse(
    readFileSync(resolve("dist/workbench/documented-workbench-colors.json"), "utf8")
  );
  assert.equal(
    documentedWorkbenchColorContract.identifiers.length,
    expectedDocumentedWorkbenchColorCount,
    `documented workbench contract must contain exactly ${expectedDocumentedWorkbenchColorCount} colors`
  );

  const allGeneratedThemesBytes = generatedThemeArtifacts.reduce(
    (generatedThemeByteTotal, { generatedThemeBytes, generatedThemeJson, generatedThemePath }) => {
      assert.ok(
        generatedThemeBytes <= maximumGeneratedThemeBytes,
        `${generatedThemePath} is ${generatedThemeBytes} bytes; maximum ${maximumGeneratedThemeBytes}`
      );
      const parsedGeneratedTheme = JSON.parse(generatedThemeJson);
      assert.equal(
        Object.keys(parsedGeneratedTheme.colors).length,
        expectedGeneratedThemeColorCount,
        `${generatedThemePath} must contain exactly ${expectedGeneratedThemeColorCount} colors`
      );
      return generatedThemeByteTotal + generatedThemeBytes;
    },
    0
  );
  assert.ok(
    allGeneratedThemesBytes <= maximumAllGeneratedThemesBytes,
    `all generated themes are ${allGeneratedThemesBytes} bytes; maximum ${maximumAllGeneratedThemesBytes}`
  );

  const themeParsingMebibytesPerSecondSamples = [];
  for (let sampleNumber = 0; sampleNumber < performanceSampleCount; sampleNumber += 1) {
    let parsedThemeNameCharacterCount = 0;
    const parsingStartedAt = performance.now();
    for (
      let iterationNumber = 0;
      iterationNumber < themeParsingIterationsPerSample;
      iterationNumber += 1
    ) {
      for (const { generatedThemeJson } of generatedThemeArtifacts) {
        const parsedGeneratedTheme = JSON.parse(generatedThemeJson);
        parsedThemeNameCharacterCount += parsedGeneratedTheme.name.length;
      }
    }
    const parsingDurationSeconds = (performance.now() - parsingStartedAt) / 1_000;
    const parsedThemeMebibytes =
      (allGeneratedThemesBytes * themeParsingIterationsPerSample) / (1_024 * 1_024);
    themeParsingMebibytesPerSecondSamples.push(parsedThemeMebibytes / parsingDurationSeconds);
    assert.ok(
      parsedThemeNameCharacterCount > 0,
      "benchmark must consume every parsed theme payload"
    );
  }

  const medianThemeParsingMebibytesPerSecond = median(themeParsingMebibytesPerSecondSamples);
  assert.ok(
    medianThemeParsingMebibytesPerSecond >= minimumThemeParsingMebibytesPerSecond,
    `median theme parsing throughput ${medianThemeParsingMebibytesPerSecond.toFixed(0)} MiB/s; minimum ${minimumThemeParsingMebibytesPerSecond} MiB/s`
  );
  testingContext.diagnostic(
    `generated payload: ${allGeneratedThemesBytes} bytes; median parsing: ${medianThemeParsingMebibytesPerSecond.toFixed(0)} MiB/s`
  );
});

test("checks the complete production generator within a cold-start budget", (testingContext) => {
  const generationCheckDurationsMilliseconds = [];
  for (let sampleNumber = 0; sampleNumber < performanceSampleCount; sampleNumber += 1) {
    const themeGenerationSnapshotDirectory = mkdtempSync(
      join(tmpdir(), "everforest-theme-generation-")
    );
    try {
      const snapshotDistDirectory = join(themeGenerationSnapshotDirectory, "dist");
      const snapshotThemesDirectory = join(themeGenerationSnapshotDirectory, "themes");
      cpSync(resolve("dist"), snapshotDistDirectory, { recursive: true });
      cpSync(resolve("themes"), snapshotThemesDirectory, { recursive: true });
      for (const { generatedThemePath } of generatedThemeArtifacts) {
        writeFileSync(
          generatedThemePath.replace(resolve("themes"), snapshotThemesDirectory),
          "stale\n"
        );
      }

      const generationCheckStartedAt = performance.now();
      const generationCheckEnvironment = { ...process.env };
      delete generationCheckEnvironment.VERIFY_GENERATED_THEMES;
      const generationCheck = spawnSync(
        process.execPath,
        [join(snapshotDistDirectory, "generate-themes.js")],
        { encoding: "utf8", env: generationCheckEnvironment }
      );
      generationCheckDurationsMilliseconds.push(performance.now() - generationCheckStartedAt);
      assert.equal(generationCheck.status, 0, generationCheck.stderr || generationCheck.stdout);
      for (const { generatedThemeJson, generatedThemePath } of generatedThemeArtifacts) {
        assert.equal(
          readFileSync(
            generatedThemePath.replace(resolve("themes"), snapshotThemesDirectory),
            "utf8"
          ),
          generatedThemeJson,
          `${generatedThemePath} must be regenerated by an unflagged write`
        );
      }
    } finally {
      rmSync(themeGenerationSnapshotDirectory, { force: true, recursive: true });
    }
  }

  const slowestColdGenerationCheckMilliseconds = Math.max(...generationCheckDurationsMilliseconds);
  assert.ok(
    slowestColdGenerationCheckMilliseconds <= maximumColdGenerationCheckMilliseconds,
    `slowest cold generation check took ${slowestColdGenerationCheckMilliseconds.toFixed(0)}ms; maximum ${maximumColdGenerationCheckMilliseconds}ms`
  );
  testingContext.diagnostic(
    `slowest cold production generation check: ${slowestColdGenerationCheckMilliseconds.toFixed(0)}ms`
  );
});

test("keeps repeated activation regeneration idempotent with lock recovery", async (testingContext) => {
  let regenerationCallCount = 0;
  let storedFingerprintCallCount = 0;
  let lockAcquireCallCount = 0;
  let lockReleaseCallCount = 0;
  let recoveryCallCount = 0;
  const activationFastPathStartedAt = performance.now();

  for (
    let activationNumber = 0;
    activationNumber < currentFingerprintActivationIterations;
    activationNumber += 1
  ) {
    await synchronizeThemeFiles({
      isLifecycleActive: () => true,
      async acquireThemeFileLock() {
        lockAcquireCallCount += 1;
        return {
          ownerToken: "benchmark-lock-owner",
          async release() {
            lockReleaseCallCount += 1;
          },
        };
      },
      async recoverThemeFiles() {
        recoveryCallCount += 1;
      },
      readCurrentSnapshot: () => currentThemeGenerationSnapshot,
      readStoredFingerprint: () => currentThemeGenerationSnapshot.fingerprint,
      async regenerateThemeFiles() {
        regenerationCallCount += 1;
        return true;
      },
      async storeCurrentFingerprint() {
        storedFingerprintCallCount += 1;
      },
    });
  }

  const activationFastPathDurationMilliseconds = performance.now() - activationFastPathStartedAt;
  assert.equal(regenerationCallCount, 0);
  assert.equal(storedFingerprintCallCount, 0);
  assert.equal(lockAcquireCallCount, currentFingerprintActivationIterations);
  assert.equal(lockReleaseCallCount, currentFingerprintActivationIterations);
  assert.equal(recoveryCallCount, currentFingerprintActivationIterations);
  testingContext.diagnostic(
    `${currentFingerprintActivationIterations} current-fingerprint activations: ${activationFastPathDurationMilliseconds.toFixed(1)}ms; lock/recovery calls: ${lockAcquireCallCount}/${recoveryCallCount}`
  );
});
