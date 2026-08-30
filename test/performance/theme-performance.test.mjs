import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import test from "node:test";
import { synchronizeThemeFiles } from "../../dist/theme-regeneration.js";
import themeManifest from "../support/theme-manifest.cjs";

const { expectedThemeContributions } = themeManifest;
const performanceSampleCount = 5;
const themeParsingIterationsPerSample = 50;
const minimumThemeParsingMebibytesPerSecond = 50;
const maximumGeneratedThemeBytes = 102 * 1_024;
const maximumAllGeneratedThemesBytes = 816 * 1_024;
const maximumColdGenerationCheckMilliseconds = 1_000;
const currentFingerprintActivationIterations = 1_000;
const maximumCurrentFingerprintActivationMilliseconds = 250;

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

  const allGeneratedThemesBytes = generatedThemeArtifacts.reduce(
    (generatedThemeByteTotal, { generatedThemeBytes, generatedThemeJson, generatedThemePath }) => {
      assert.ok(
        generatedThemeBytes <= maximumGeneratedThemeBytes,
        `${generatedThemePath} is ${generatedThemeBytes} bytes; maximum ${maximumGeneratedThemeBytes}`
      );
      const parsedGeneratedTheme = JSON.parse(generatedThemeJson);
      assert.ok(
        Object.keys(parsedGeneratedTheme.colors).length >= 900,
        `${generatedThemePath} must contain a complete workbench color map`
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
    const generationCheckStartedAt = performance.now();
    const generationCheck = spawnSync(process.execPath, [resolve("dist/generate-themes.js")], {
      encoding: "utf8",
      env: { ...process.env, VERIFY_GENERATED_THEMES: "1" },
    });
    generationCheckDurationsMilliseconds.push(performance.now() - generationCheckStartedAt);
    assert.equal(generationCheck.status, 0, generationCheck.stderr || generationCheck.stdout);
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

test("keeps current-fingerprint activation disk-free and fast", async (testingContext) => {
  let regenerationCallCount = 0;
  const activationFastPathStartedAt = performance.now();

  for (
    let activationNumber = 0;
    activationNumber < currentFingerprintActivationIterations;
    activationNumber += 1
  ) {
    await synchronizeThemeFiles({
      readCurrentFingerprint: () => "current",
      readStoredFingerprint: () => "current",
      async regenerateThemeFiles() {
        regenerationCallCount += 1;
        return true;
      },
      async storeCurrentFingerprint() {
        throw new Error("Current activation fingerprint must not be rewritten");
      },
    });
  }

  const activationFastPathDurationMilliseconds = performance.now() - activationFastPathStartedAt;
  assert.equal(regenerationCallCount, 0);
  assert.ok(
    activationFastPathDurationMilliseconds <= maximumCurrentFingerprintActivationMilliseconds,
    `${currentFingerprintActivationIterations} current-fingerprint activations took ${activationFastPathDurationMilliseconds.toFixed(1)}ms; maximum ${maximumCurrentFingerprintActivationMilliseconds}ms`
  );
  testingContext.diagnostic(
    `${currentFingerprintActivationIterations} current-fingerprint activations: ${activationFastPathDurationMilliseconds.toFixed(1)}ms`
  );
});
