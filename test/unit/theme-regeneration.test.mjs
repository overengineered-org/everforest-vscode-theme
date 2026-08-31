import assert from "node:assert/strict";
import test from "node:test";
import {
  createThemeGenerationSnapshot,
  createThemeGenerationFingerprint,
  maximumThemeSynchronizationAttempts,
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
const currentThemeGenerationSnapshot = createThemeGenerationSnapshot(
  "1.5.0",
  darkThemePreferences,
  lightThemePreferences
);

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

test("snapshots clone and freeze every preference before regeneration", () => {
  const mutableDarkThemePreferences = { ...darkThemePreferences };
  const mutableLightThemePreferences = { ...lightThemePreferences };
  const themeGenerationSnapshot = createThemeGenerationSnapshot(
    "1.5.0",
    mutableDarkThemePreferences,
    mutableLightThemePreferences
  );

  mutableDarkThemePreferences.cursorColor = "purple";
  mutableLightThemePreferences.italicComments = false;

  assert.equal(themeGenerationSnapshot.dark.cursorColor, "white");
  assert.equal(themeGenerationSnapshot.light.italicComments, true);
  assert.equal(Object.isFrozen(themeGenerationSnapshot), true);
  assert.equal(Object.isFrozen(themeGenerationSnapshot.dark), true);
  assert.equal(Object.isFrozen(themeGenerationSnapshot.light), true);
  assert.match(themeGenerationSnapshot.fingerprint, /^v1:[0-9a-f]{64}$/);
});

test("skips repeat lifecycle work when the verified fingerprint is current", async () => {
  let regenerationCallCount = 0;
  let storedFingerprintUpdateCount = 0;
  const themeFilesChanged = await synchronizeThemeFiles({
    isLifecycleActive: () => true,
    acquireThemeFileLock: async () => ({
      ownerToken: "skip-current-lock-owner",
      async release() {},
    }),
    recoverThemeFiles: async () => {},
    readCurrentSnapshot: () => currentThemeGenerationSnapshot,
    readStoredFingerprint: () => currentThemeGenerationSnapshot.fingerprint,
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
      isLifecycleActive: () => true,
      acquireThemeFileLock: async () => ({
        ownerToken: "force-regeneration-lock-owner",
        async release() {},
      }),
      recoverThemeFiles: async () => {},
      readCurrentSnapshot: () => currentThemeGenerationSnapshot,
      readStoredFingerprint: () => currentThemeGenerationSnapshot.fingerprint,
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
  assert.deepEqual(storedFingerprints, [currentThemeGenerationSnapshot.fingerprint]);
});

test("stores the fingerprint only after successful theme regeneration", async () => {
  const storedFingerprints = [];
  const themeFilesChanged = await synchronizeThemeFiles({
    isLifecycleActive: () => true,
    acquireThemeFileLock: async () => ({
      ownerToken: "successful-regeneration-lock-owner",
      async release() {},
    }),
    recoverThemeFiles: async () => {},
    readCurrentSnapshot: () => currentThemeGenerationSnapshot,
    readStoredFingerprint: () => "old",
    async regenerateThemeFiles() {
      return true;
    },
    async storeCurrentFingerprint(themeGenerationFingerprint) {
      storedFingerprints.push(themeGenerationFingerprint);
    },
  });

  assert.equal(themeFilesChanged, true);
  assert.deepEqual(storedFingerprints, [currentThemeGenerationSnapshot.fingerprint]);

  await assert.rejects(
    synchronizeThemeFiles({
      isLifecycleActive: () => true,
      acquireThemeFileLock: async () => ({
        ownerToken: "failed-regeneration-lock-owner",
        async release() {},
      }),
      recoverThemeFiles: async () => {},
      readCurrentSnapshot: () => currentThemeGenerationSnapshot,
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
  assert.deepEqual(storedFingerprints, [currentThemeGenerationSnapshot.fingerprint]);
});

test("serializes same-process synchronization calls", async () => {
  let activeRegenerations = 0;
  let maximumActiveRegenerations = 0;
  let regenerationCallCount = 0;
  let signalFirstRegenerationStarted;
  const firstRegenerationStarted = new Promise((resolve) => {
    signalFirstRegenerationStarted = resolve;
  });
  let releaseFirstRegeneration;
  const firstRegenerationRelease = new Promise((resolve) => {
    releaseFirstRegeneration = resolve;
  });
  const synchronizationDependencies = {
    isLifecycleActive: () => true,
    acquireThemeFileLock: async () => ({
      ownerToken: "serialized-regeneration-lock-owner",
      async release() {},
    }),
    recoverThemeFiles: async () => {},
    readCurrentSnapshot: () => currentThemeGenerationSnapshot,
    readStoredFingerprint: () => "old",
    async regenerateThemeFiles() {
      regenerationCallCount += 1;
      activeRegenerations += 1;
      maximumActiveRegenerations = Math.max(maximumActiveRegenerations, activeRegenerations);
      if (regenerationCallCount === 1) {
        signalFirstRegenerationStarted();
        await firstRegenerationRelease;
      }
      activeRegenerations -= 1;
      return true;
    },
    async storeCurrentFingerprint() {},
  };

  const firstSynchronization = synchronizeThemeFiles(synchronizationDependencies);
  await firstRegenerationStarted;
  const secondSynchronization = synchronizeThemeFiles(synchronizationDependencies);
  assert.equal(maximumActiveRegenerations, 1);
  releaseFirstRegeneration();
  await Promise.all([firstSynchronization, secondSynchronization]);

  assert.equal(regenerationCallCount, 2);
  assert.equal(maximumActiveRegenerations, 1);
});

test("acquires and recovers before reading the immutable snapshot", async () => {
  const recordedSteps = [];
  await synchronizeThemeFiles({
    isLifecycleActive: () => true,
    acquireThemeFileLock: async () => {
      recordedSteps.push("acquire");
      return {
        ownerToken: "lock-owner",
        async release() {
          recordedSteps.push("release");
        },
      };
    },
    recoverThemeFiles: async () => {
      recordedSteps.push("recover");
    },
    readCurrentSnapshot: () => {
      recordedSteps.push("snapshot");
      return currentThemeGenerationSnapshot;
    },
    readStoredFingerprint: () => "old",
    async regenerateThemeFiles() {
      recordedSteps.push("regenerate");
      return false;
    },
    async storeCurrentFingerprint() {
      recordedSteps.push("store");
    },
  });

  assert.deepEqual(recordedSteps, [
    "acquire",
    "recover",
    "snapshot",
    "regenerate",
    "snapshot",
    "store",
    "release",
  ]);
});

test("releases a lock when synchronization fails and surfaces release errors", async () => {
  let releaseCallCount = 0;
  await assert.rejects(
    synchronizeThemeFiles({
      isLifecycleActive: () => true,
      acquireThemeFileLock: async () => ({
        ownerToken: "lock-owner",
        async release() {
          releaseCallCount += 1;
          throw new Error("lock release failed");
        },
      }),
      recoverThemeFiles: async () => {},
      readCurrentSnapshot: () => currentThemeGenerationSnapshot,
      readStoredFingerprint: () => "old",
      async regenerateThemeFiles() {
        throw new Error("regeneration failed");
      },
      async storeCurrentFingerprint() {},
    }),
    /lock release failed/
  );
  assert.equal(releaseCallCount, 1);
});

test("keeps committed regeneration successful when lock release fails", async () => {
  let lockAcquireCallCount = 0;
  let lockReleaseCallCount = 0;
  let shouldFailLockRelease = true;
  const synchronizationDependencies = {
    isLifecycleActive: () => true,
    acquireThemeFileLock: async () => {
      lockAcquireCallCount += 1;
      return {
        ownerToken: "committed-release-failure-lock-owner",
        async release() {
          lockReleaseCallCount += 1;
          if (shouldFailLockRelease) {
            shouldFailLockRelease = false;
            throw new Error("lock release failed after commit");
          }
        },
      };
    },
    recoverThemeFiles: async () => {},
    readCurrentSnapshot: () => currentThemeGenerationSnapshot,
    readStoredFingerprint: () => "old",
    async regenerateThemeFiles() {
      return true;
    },
    async storeCurrentFingerprint() {},
  };

  assert.equal(await synchronizeThemeFiles(synchronizationDependencies), true);
  assert.equal(await synchronizeThemeFiles(synchronizationDependencies), true);
  assert.equal(lockAcquireCallCount, 2);
  assert.equal(lockReleaseCallCount, 2);
});

test("retries when settings drift after a write and stores only the stable fingerprint", async () => {
  const firstSnapshot = createThemeGenerationSnapshot(
    "1.5.0",
    darkThemePreferences,
    lightThemePreferences
  );
  const secondSnapshot = createThemeGenerationSnapshot(
    "1.5.0",
    { ...darkThemePreferences, cursorColor: "purple" },
    lightThemePreferences
  );
  const snapshotsRead = [firstSnapshot, secondSnapshot, secondSnapshot];
  const regeneratedSnapshots = [];
  const storedFingerprints = [];
  const themeFilesChanged = await synchronizeThemeFiles({
    isLifecycleActive: () => true,
    acquireThemeFileLock: async () => ({
      ownerToken: "drift-retry-lock-owner",
      async release() {},
    }),
    recoverThemeFiles: async () => {},
    readCurrentSnapshot: () => snapshotsRead.shift() ?? secondSnapshot,
    readStoredFingerprint: () => "old",
    async regenerateThemeFiles(themeGenerationSnapshot) {
      regeneratedSnapshots.push(themeGenerationSnapshot);
      return true;
    },
    async storeCurrentFingerprint(themeGenerationFingerprint) {
      storedFingerprints.push(themeGenerationFingerprint);
    },
  });

  assert.equal(themeFilesChanged, true);
  assert.deepEqual(regeneratedSnapshots, [firstSnapshot, secondSnapshot]);
  assert.deepEqual(storedFingerprints, [secondSnapshot.fingerprint]);
});

test("does not accept stored A after drifted B leaves generated files invalid", async () => {
  const driftedThemeGenerationSnapshot = createThemeGenerationSnapshot(
    "1.5.0",
    { ...darkThemePreferences, cursorColor: "purple" },
    lightThemePreferences
  );
  const bouncedSnapshotReads = [
    driftedThemeGenerationSnapshot,
    currentThemeGenerationSnapshot,
    currentThemeGenerationSnapshot,
    currentThemeGenerationSnapshot,
  ];
  const storedFingerprintReads = [currentThemeGenerationSnapshot.fingerprint];
  const storedFingerprints = [];
  const regeneratedSnapshots = [];
  let storedFingerprintReadCount = 0;
  let generatedThemeFilesState = "current";

  const themeFilesChanged = await synchronizeThemeFiles({
    isLifecycleActive: () => true,
    acquireThemeFileLock: async () => ({
      ownerToken: "bounce-retry-lock-owner",
      async release() {},
    }),
    recoverThemeFiles: async () => {},
    readCurrentSnapshot: () => bouncedSnapshotReads.shift() ?? currentThemeGenerationSnapshot,
    readStoredFingerprint: () => {
      storedFingerprintReadCount += 1;
      return storedFingerprintReads.shift() ?? currentThemeGenerationSnapshot.fingerprint;
    },
    async regenerateThemeFiles(themeGenerationSnapshot) {
      regeneratedSnapshots.push(themeGenerationSnapshot);
      generatedThemeFilesState =
        regeneratedSnapshots.length === 1
          ? "missing-dark-and-corrupt-light"
          : themeGenerationSnapshot.fingerprint;
      return true;
    },
    async storeCurrentFingerprint(themeGenerationFingerprint) {
      storedFingerprints.push(themeGenerationFingerprint);
    },
  });

  assert.equal(themeFilesChanged, true);
  assert.equal(storedFingerprintReadCount, 1);
  assert.equal(generatedThemeFilesState, currentThemeGenerationSnapshot.fingerprint);
  assert.deepEqual(regeneratedSnapshots, [
    driftedThemeGenerationSnapshot,
    currentThemeGenerationSnapshot,
  ]);
  assert.deepEqual(storedFingerprints, [currentThemeGenerationSnapshot.fingerprint]);
});

test("stops after the bounded settings-drift retry limit", async () => {
  const firstSnapshot = createThemeGenerationSnapshot(
    "1.5.0",
    darkThemePreferences,
    lightThemePreferences
  );
  const driftingSnapshot = createThemeGenerationSnapshot(
    "1.5.0",
    { ...darkThemePreferences, cursorColor: "purple" },
    lightThemePreferences
  );
  let readCount = 0;
  let regenerationCallCount = 0;
  const storedFingerprints = [];

  await assert.rejects(
    synchronizeThemeFiles({
      isLifecycleActive: () => true,
      acquireThemeFileLock: async () => ({
        ownerToken: "drift-limit-lock-owner",
        async release() {},
      }),
      recoverThemeFiles: async () => {},
      readCurrentSnapshot: () => {
        readCount += 1;
        return readCount % 2 === 1 ? firstSnapshot : driftingSnapshot;
      },
      readStoredFingerprint: () => "old",
      async regenerateThemeFiles() {
        regenerationCallCount += 1;
        return true;
      },
      async storeCurrentFingerprint(themeGenerationFingerprint) {
        storedFingerprints.push(themeGenerationFingerprint);
      },
    }),
    new RegExp(`after ${maximumThemeSynchronizationAttempts} attempts`)
  );

  assert.equal(regenerationCallCount, maximumThemeSynchronizationAttempts);
  assert.deepEqual(storedFingerprints, []);
});

test("does not regenerate or store when reading the fingerprint fails", async () => {
  let regenerationCallCount = 0;
  await assert.rejects(
    synchronizeThemeFiles({
      isLifecycleActive: () => true,
      acquireThemeFileLock: async () => ({
        ownerToken: "fingerprint-failure-lock-owner",
        async release() {},
      }),
      recoverThemeFiles: async () => {},
      readCurrentSnapshot: () => {
        throw new Error("fingerprint unavailable");
      },
      readStoredFingerprint: () => "old",
      async regenerateThemeFiles() {
        regenerationCallCount += 1;
        return true;
      },
      async storeCurrentFingerprint() {
        throw new Error("must not store");
      },
    }),
    /fingerprint unavailable/
  );
  assert.equal(regenerationCallCount, 0);
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

test("does not notify when themes are current unless requested", async () => {
  const { recordedInteractions, userInterface } = createRecordedThemeConfigurationUserInterface();

  await synchronizeConfiguredThemesWithFeedback(async () => false, userInterface);

  assert.deepEqual(recordedInteractions, []);
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

test("does not retry when applied configuration error is dismissed", async () => {
  const recordedInteractions = [];
  const userInterface = {
    ...createRecordedThemeConfigurationUserInterface().userInterface,
    async showRegenerationError(message) {
      recordedInteractions.push(["error", message]);
      return false;
    },
  };

  await reportAppliedThemeConfiguration(
    async () => {
      throw new Error("permission denied");
    },
    userInterface,
    2
  );

  assert.equal(recordedInteractions.length, 1);
  assert.equal(recordedInteractions[0][0], "error");
});

test("honors Try Again after startup regeneration fails", async () => {
  const { recordedInteractions, userInterface } = createRecordedThemeConfigurationUserInterface();

  await synchronizeConfiguredThemesWithFeedback(async () => {
    throw new Error("startup permission denied");
  }, userInterface);

  assert.equal(recordedInteractions[0][0], "error");
  assert.deepEqual(recordedInteractions[1], ["retry"]);
});

test("does not retry after startup regeneration error is dismissed", async () => {
  const recordedInteractions = [];
  const userInterface = {
    ...createRecordedThemeConfigurationUserInterface().userInterface,
    async showRegenerationError(message) {
      recordedInteractions.push(["error", message]);
      return false;
    },
  };

  await synchronizeConfiguredThemesWithFeedback(async () => {
    throw new Error("startup permission denied");
  }, userInterface);

  assert.equal(recordedInteractions.length, 1);
  assert.equal(recordedInteractions[0][0], "error");
});

test("stops synchronization at every lifecycle boundary and releases its lock", async () => {
  const createLifecycleDependencies = (stopAt, includeRecovery = false) => {
    let lifecycleCheckCount = 0;
    const events = [];
    return {
      events,
      dependencies: {
        isLifecycleActive: () => {
          lifecycleCheckCount += 1;
          return lifecycleCheckCount !== stopAt;
        },
        acquireThemeFileLock: async () => ({
          ownerToken: "lock-owner",
          async release() {
            events.push("release");
          },
        }),
        async recoverThemeFiles() {
          if (includeRecovery) events.push("recover");
        },
        readCurrentSnapshot: () => {
          events.push("snapshot");
          return currentThemeGenerationSnapshot;
        },
        readStoredFingerprint: () => "old",
        async regenerateThemeFiles() {
          events.push("regenerate");
          return true;
        },
        async storeCurrentFingerprint() {
          events.push("store");
        },
      },
    };
  };

  for (let stopAt = 1; stopAt <= 9; stopAt += 1) {
    const { dependencies, events } = createLifecycleDependencies(stopAt);
    assert.equal(await synchronizeThemeFiles(dependencies), false);
    if (stopAt > 1) assert.deepEqual(events.at(-1), "release");
  }
  for (const stopAt of [3, 4]) {
    const { dependencies, events } = createLifecycleDependencies(stopAt, true);
    assert.equal(await synchronizeThemeFiles(dependencies), false);
    assert.deepEqual(events.at(-1), "release");
  }
});

test("reports changed configured themes and both applied no-change messages", async () => {
  const changedInteractions = [];
  await synchronizeConfiguredThemesWithFeedback(async () => true, {
    async promptToReload(message) {
      changedInteractions.push(message);
    },
    async retryThemeRegeneration() {},
    async showInformation() {},
    async showRegenerationError() {
      return false;
    },
  });
  assert.equal(changedInteractions.length, 1);

  for (const configurationUpdateCount of [0, 1]) {
    const { recordedInteractions, userInterface } = createRecordedThemeConfigurationUserInterface();
    await reportAppliedThemeConfiguration(
      async () => false,
      userInterface,
      configurationUpdateCount
    );
    assert.equal(recordedInteractions[0][0], "information");
    assert.match(
      recordedInteractions[0][1],
      configurationUpdateCount === 0 ? /already matches/ : /applied your choices/
    );
  }
});

test("changes the fingerprint for every dark and light preference", () => {
  const changedPreferenceValues = {
    appearance: "light",
    contrast: "hard",
    workbenchStyle: "flat",
    cursorColor: "purple",
    selectionColor: "blue",
    italicKeywords: true,
    italicComments: false,
    diagnosticTextBackgroundOpacity: "30%",
    highContrast: true,
  };
  const changedLightPreferenceValues = {
    appearance: "dark",
    contrast: "hard",
    workbenchStyle: "flat",
    cursorColor: "white",
    selectionColor: "blue",
    italicKeywords: true,
    italicComments: false,
    diagnosticTextBackgroundOpacity: "30%",
    highContrast: true,
  };

  for (const preferenceName of Object.keys(changedPreferenceValues)) {
    const changedDarkFingerprint = createThemeGenerationFingerprint(
      "1.5.0",
      { ...darkThemePreferences, [preferenceName]: changedPreferenceValues[preferenceName] },
      lightThemePreferences
    );
    const changedLightFingerprint = createThemeGenerationFingerprint(
      "1.5.0",
      darkThemePreferences,
      { ...lightThemePreferences, [preferenceName]: changedLightPreferenceValues[preferenceName] }
    );

    assert.notEqual(changedDarkFingerprint, currentThemeGenerationSnapshot.fingerprint);
    assert.notEqual(changedLightFingerprint, currentThemeGenerationSnapshot.fingerprint);
  }
});

test("verifies generated files before a lifecycle fingerprint has been stored", async () => {
  const recordedSteps = [];
  const synchronizedThemeFiles = await synchronizeThemeFiles({
    isLifecycleActive: () => true,
    acquireThemeFileLock: async () => ({
      ownerToken: "lock-owner",
      async release() {
        recordedSteps.push("release");
      },
    }),
    recoverThemeFiles: async () => {},
    readCurrentSnapshot: () => {
      recordedSteps.push("snapshot");
      return currentThemeGenerationSnapshot;
    },
    readStoredFingerprint: () => {
      recordedSteps.push("stored-fingerprint");
      return undefined;
    },
    async regenerateThemeFiles() {
      recordedSteps.push("regenerate");
      return false;
    },
    async storeCurrentFingerprint() {
      recordedSteps.push("store");
    },
  });

  assert.equal(synchronizedThemeFiles, false);
  assert.deepEqual(recordedSteps, [
    "snapshot",
    "stored-fingerprint",
    "regenerate",
    "snapshot",
    "store",
    "release",
  ]);
});

test("releases an acquired lock when recovery fails before regeneration", async () => {
  const recoveryError = new Error("recovery failed");
  let releaseCallCount = 0;

  await assert.rejects(
    synchronizeThemeFiles({
      isLifecycleActive: () => true,
      acquireThemeFileLock: async () => ({
        ownerToken: "lock-owner",
        async release() {
          releaseCallCount += 1;
        },
      }),
      recoverThemeFiles: async () => {
        throw recoveryError;
      },
      readCurrentSnapshot: () => currentThemeGenerationSnapshot,
      readStoredFingerprint: () => "old",
      async regenerateThemeFiles() {
        throw new Error("must not regenerate after recovery failure");
      },
      async storeCurrentFingerprint() {
        throw new Error("must not store after recovery failure");
      },
    }),
    recoveryError
  );

  assert.equal(releaseCallCount, 1);
});

test("does not start queued synchronization after lifecycle disposal", async () => {
  let signalFirstRegenerationStarted;
  const firstRegenerationStarted = new Promise((resolve) => {
    signalFirstRegenerationStarted = resolve;
  });
  let releaseFirstRegeneration;
  const firstRegenerationRelease = new Promise((resolve) => {
    releaseFirstRegeneration = resolve;
  });
  let lifecycleActive = true;
  let secondLockAcquisitionCount = 0;

  const firstSynchronization = synchronizeThemeFiles({
    isLifecycleActive: () => true,
    acquireThemeFileLock: async () => ({
      ownerToken: "first-queued-disposal-lock-owner",
      async release() {},
    }),
    recoverThemeFiles: async () => {},
    readCurrentSnapshot: () => currentThemeGenerationSnapshot,
    readStoredFingerprint: () => "old",
    async regenerateThemeFiles() {
      signalFirstRegenerationStarted();
      await firstRegenerationRelease;
      return true;
    },
    async storeCurrentFingerprint() {},
  });
  await firstRegenerationStarted;

  const secondSynchronization = synchronizeThemeFiles({
    isLifecycleActive: () => lifecycleActive,
    acquireThemeFileLock: async () => {
      secondLockAcquisitionCount += 1;
      return {
        ownerToken: "queued-lock-owner",
        async release() {},
      };
    },
    recoverThemeFiles: async () => {},
    readCurrentSnapshot: () => currentThemeGenerationSnapshot,
    readStoredFingerprint: () => "old",
    async regenerateThemeFiles() {
      throw new Error("must not regenerate after queued disposal");
    },
    async storeCurrentFingerprint() {
      throw new Error("must not store after queued disposal");
    },
  });

  lifecycleActive = false;
  releaseFirstRegeneration();

  assert.equal(await firstSynchronization, true);
  assert.equal(await secondSynchronization, false);
  assert.equal(secondLockAcquisitionCount, 0);
});

test("does not show a current-theme notification after changed files reload", async () => {
  const recordedInteractions = [];
  await synchronizeConfiguredThemesWithFeedback(
    async () => true,
    {
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
        return false;
      },
    },
    true
  );

  assert.equal(recordedInteractions.length, 1);
  assert.equal(recordedInteractions[0][0], "reload");
});
