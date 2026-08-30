import assert from "node:assert/strict";
import test from "node:test";
import {
  createThemeGenerationFingerprint,
  reportAppliedThemeConfiguration,
  synchronizeConfiguredThemesWithFeedback,
  synchronizeThemeFiles,
} from "../../dist/theme-regeneration.js";

const darkThemePreferences = {
  appearance: "dark",
  contrast: "medium",
  workbenchStyle: "material",
  cursorColor: "white",
  selectionColor: "grey",
  italicKeywords: false,
  italicComments: true,
  diagnosticTextBackgroundOpacity: "0%",
  highContrast: false,
};
const lightThemePreferences = {
  ...darkThemePreferences,
  appearance: "light",
  cursorColor: "black",
};

function createRecordedThemeConfigurationUserInterface() {
  const recordedInteractions = [];
  return {
    recordedInteractions,
    userInterface: {
      async promptToReload(message) {
        recordedInteractions.push(["reload", message]);
      },
      async retryThemeRegeneration() {
        recordedInteractions.push(["retry"]);
      },
      async showInformation(message) {
        recordedInteractions.push(["information", message]);
      },
      async showRegenerationError(message) {
        recordedInteractions.push(["error", message]);
        return true;
      },
    },
  };
}

test("fingerprints the extension version and complete Light and Dark preferences", () => {
  const initialFingerprint = createThemeGenerationFingerprint(
    "1.5.0",
    darkThemePreferences,
    lightThemePreferences
  );

  assert.notEqual(
    createThemeGenerationFingerprint("1.5.1", darkThemePreferences, lightThemePreferences),
    initialFingerprint
  );
  assert.notEqual(
    createThemeGenerationFingerprint(
      "1.5.0",
      { ...darkThemePreferences, cursorColor: "purple" },
      lightThemePreferences
    ),
    initialFingerprint
  );
});

test("skips disk regeneration when the stored fingerprint is current", async () => {
  let regenerationCallCount = 0;
  let storedFingerprintUpdateCount = 0;
  const themeFilesChanged = await synchronizeThemeFiles({
    readCurrentFingerprint: () => "current",
    readStoredFingerprint: () => "current",
    async regenerateThemeFiles() {
      regenerationCallCount += 1;
      return true;
    },
    async storeCurrentFingerprint() {
      storedFingerprintUpdateCount += 1;
    },
  });

  assert.equal(themeFilesChanged, false);
  assert.equal(regenerationCallCount, 0);
  assert.equal(storedFingerprintUpdateCount, 0);
});

test("forces regeneration when the stored fingerprint is current", async () => {
  let regenerationCallCount = 0;
  const storedFingerprints = [];
  const themeFilesChanged = await synchronizeThemeFiles(
    {
      readCurrentFingerprint: () => "current",
      readStoredFingerprint: () => "current",
      async regenerateThemeFiles() {
        regenerationCallCount += 1;
        return true;
      },
      async storeCurrentFingerprint(themeGenerationFingerprint) {
        storedFingerprints.push(themeGenerationFingerprint);
      },
    },
    true
  );

  assert.equal(themeFilesChanged, true);
  assert.equal(regenerationCallCount, 1);
  assert.deepEqual(storedFingerprints, ["current"]);
});

test("stores the fingerprint only after successful theme regeneration", async () => {
  const storedFingerprints = [];
  const themeFilesChanged = await synchronizeThemeFiles({
    readCurrentFingerprint: () => "new",
    readStoredFingerprint: () => "old",
    async regenerateThemeFiles() {
      return true;
    },
    async storeCurrentFingerprint(themeGenerationFingerprint) {
      storedFingerprints.push(themeGenerationFingerprint);
    },
  });

  assert.equal(themeFilesChanged, true);
  assert.deepEqual(storedFingerprints, ["new"]);

  await assert.rejects(
    synchronizeThemeFiles({
      readCurrentFingerprint: () => "failed",
      readStoredFingerprint: () => "old",
      async regenerateThemeFiles() {
        throw new Error("write failed");
      },
      async storeCurrentFingerprint(themeGenerationFingerprint) {
        storedFingerprints.push(themeGenerationFingerprint);
      },
    }),
    /write failed/
  );
  assert.deepEqual(storedFingerprints, ["new"]);
});

test("offers exactly one reload when configured theme files change", async () => {
  const { recordedInteractions, userInterface } = createRecordedThemeConfigurationUserInterface();

  await reportAppliedThemeConfiguration(async () => true, userInterface, 4);

  assert.equal(recordedInteractions.length, 1);
  assert.equal(recordedInteractions[0][0], "reload");
});

test("reports current themes without a reload when no files change", async () => {
  const { recordedInteractions, userInterface } = createRecordedThemeConfigurationUserInterface();

  await synchronizeConfiguredThemesWithFeedback(async () => false, userInterface, true);

  assert.deepEqual(recordedInteractions, [
    ["information", "Everforest Complete themes are current."],
  ]);
});

test("offers one retry after an applied configuration cannot regenerate themes", async () => {
  const { recordedInteractions, userInterface } = createRecordedThemeConfigurationUserInterface();

  await reportAppliedThemeConfiguration(
    async () => {
      throw new Error("permission denied");
    },
    userInterface,
    2
  );

  assert.equal(recordedInteractions.length, 2);
  assert.equal(recordedInteractions[0][0], "error");
  assert.deepEqual(recordedInteractions[1], ["retry"]);
});
