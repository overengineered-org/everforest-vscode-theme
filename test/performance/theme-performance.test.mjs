import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import test from "node:test";
import { getPalette } from "../../dist/palette/index.js";
import { createWorkbenchColors } from "../../dist/workbench/material.js";

const themeVariants = [
  { appearance: "dark", contrast: "soft" },
  { appearance: "dark", contrast: "medium" },
  { appearance: "dark", contrast: "hard" },
  { appearance: "light", contrast: "soft" },
  { appearance: "light", contrast: "medium" },
  { appearance: "light", contrast: "hard" },
];
const performanceSampleCount = 5;
const workbenchGenerationIterationsPerSample = 20;
const minimumWorkbenchMapsPerSecond = 500;
const themeParsingIterationsPerSample = 50;
const minimumThemeParsingMebibytesPerSecond = 50;
const maximumGeneratedThemeBytes = 102 * 1_024;
const maximumAllGeneratedThemesBytes = 612 * 1_024;
const maximumColdGenerationCheckMilliseconds = 1_000;

const generatedThemeArtifacts = themeVariants.map(({ appearance, contrast }) => {
  const generatedThemePath = resolve(
    "themes",
    `everforest-complete-${appearance}-${contrast}-color-theme.json`
  );
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

test("sustains complete workbench color generation throughput", (testingContext) => {
  for (const { appearance, contrast } of themeVariants) {
    const generatedWorkbenchColors = createWorkbenchColors(
      getPalette(appearance, contrast),
      appearance
    );
    assert.ok(
      Object.keys(generatedWorkbenchColors).length >= 900,
      "benchmark must exercise a complete workbench color map"
    );
  }

  const generatedWorkbenchMapsPerSecondSamples = [];
  for (let sampleNumber = 0; sampleNumber < performanceSampleCount; sampleNumber += 1) {
    let latestGeneratedWorkbenchColors;
    const generationStartedAt = performance.now();
    for (
      let iterationNumber = 0;
      iterationNumber < workbenchGenerationIterationsPerSample;
      iterationNumber += 1
    ) {
      for (const { appearance, contrast } of themeVariants) {
        latestGeneratedWorkbenchColors = createWorkbenchColors(
          getPalette(appearance, contrast),
          appearance
        );
      }
    }
    const generationDurationSeconds = (performance.now() - generationStartedAt) / 1_000;
    generatedWorkbenchMapsPerSecondSamples.push(
      (workbenchGenerationIterationsPerSample * themeVariants.length) / generationDurationSeconds
    );
    assert.ok(
      latestGeneratedWorkbenchColors?.["scmGraph.historyItemRefColor"],
      "benchmark must consume the generated color map"
    );
  }

  const medianWorkbenchMapsPerSecond = median(generatedWorkbenchMapsPerSecondSamples);
  assert.ok(
    medianWorkbenchMapsPerSecond >= minimumWorkbenchMapsPerSecond,
    `median workbench generation throughput ${medianWorkbenchMapsPerSecond.toFixed(0)} maps/s; minimum ${minimumWorkbenchMapsPerSecond} maps/s`
  );
  testingContext.diagnostic(
    `median workbench generation: ${medianWorkbenchMapsPerSecond.toFixed(0)} maps/s`
  );
});

test("keeps shipped theme payloads lean and fast to parse", (testingContext) => {
  assert.equal(generatedThemeArtifacts.length, 6, "benchmark must cover every shipped theme");

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
