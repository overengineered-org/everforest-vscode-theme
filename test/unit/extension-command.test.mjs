import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { tmpdir } from "node:os";

const fakeVscodeModulePath = join(
  mkdtempSync(join(tmpdir(), "everforest-vscode-boundary-")),
  "vscode.cjs"
);
writeFileSync(fakeVscodeModulePath, "module.exports = globalThis.__everforestVscodeTestApi;\n");
globalThis.__everforestVscodeTestApi = {
  __esModule: true,
  commands: {},
  window: {},
  workspace: {},
  ConfigurationTarget: { Global: 1 },
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "vscode") {
      return { shortCircuit: true, url: pathToFileURL(fakeVscodeModulePath).href };
    }
    return nextResolve(specifier, context);
  },
});

const { activate } = await import("../../dist/extension.js");
const { createThemeGenerationSnapshot } = await import("../../dist/theme-regeneration.js");
const { defaultThemePreferences } = await import("../../dist/theme.js");

const defaultConfigurationValues = {
  "everforestComplete.darkContrast": "medium",
  "everforestComplete.lightContrast": "medium",
  "everforestComplete.darkWorkbench": "material",
  "everforestComplete.lightWorkbench": "material",
  "everforestComplete.darkCursor": "white",
  "everforestComplete.lightCursor": "black",
  "everforestComplete.darkSelection": "grey",
  "everforestComplete.lightSelection": "grey",
  "everforestComplete.italicKeywords": false,
  "everforestComplete.italicComments": true,
  "everforestComplete.diagnosticTextBackgroundOpacity": "0%",
  "everforestComplete.highContrast": false,
  "everforestComplete.autoSwitch.enabled": false,
  "everforestComplete.autoSwitch.schedule": [
    { time: "07:00", theme: "Everforest Complete Light" },
    { time: "19:00", theme: "Everforest Complete Dark" },
  ],
  "window.autoDetectColorScheme": false,
  "workbench.colorTheme": "Everforest Complete Dark",
};

function createVscodeBoundary() {
  const calls = [];
  const commandHandlers = new Map();
  const configurationChangeHandlers = [];
  const configurationValues = new Map();
  let resolveRetryPromptShown;
  const retryPromptShown = new Promise((resolve) => {
    resolveRetryPromptShown = resolve;
  });
  let resolveColorThemeUpdateStarted;
  const colorThemeUpdateStarted = new Promise((resolve) => {
    resolveColorThemeUpdateStarted = resolve;
  });
  const extensionRoot = mkdtempSync(join(tmpdir(), "everforest-extension-"));
  const themesDirectory = join(extensionRoot, "themes");
  mkdirSync(themesDirectory);
  for (const themeFileName of [
    "everforest-complete-dark-color-theme.json",
    "everforest-complete-light-color-theme.json",
  ]) {
    copyFileSync(
      join(process.cwd(), "themes", themeFileName),
      join(themesDirectory, themeFileName)
    );
  }

  const themeGenerationSnapshot = createThemeGenerationSnapshot(
    "1.5.0",
    defaultThemePreferences.dark,
    defaultThemePreferences.light
  );
  const boundary = {
    calls,
    commandHandlers,
    configurationChangeHandlers,
    configurationValues,
    extensionRoot,
    retryPromptShown,
    showQuickPickError: undefined,
    configurationReadError: undefined,
    configurationReadErrorKey: undefined,
    deferRegenerationRetry: false,
    resolveRegenerationRetry: undefined,
    deferColorThemeUpdate: false,
    resolveColorThemeUpdate: undefined,
    colorThemeUpdateStarted,
    commands: {
      registerCommand(commandIdentifier, commandHandler) {
        commandHandlers.set(commandIdentifier, commandHandler);
        return { dispose() {} };
      },
      async executeCommand(commandIdentifier) {
        calls.push({ operation: "executeCommand", commandIdentifier });
      },
    },
    window: {
      async showQuickPick(items, options) {
        calls.push({ operation: "showQuickPick", items, options });
        if (boundary.showQuickPickError) throw boundary.showQuickPickError;
        return undefined;
      },
      async showInputBox(options) {
        calls.push({ operation: "showInputBox", options });
        return undefined;
      },
      async showInformationMessage(message, action) {
        calls.push({ operation: "showInformationMessage", message, action });
        return undefined;
      },
      async showWarningMessage(message) {
        calls.push({ operation: "showWarningMessage", message });
      },
      async showErrorMessage(message, action) {
        calls.push({ operation: "showErrorMessage", message, action });
        if (boundary.deferRegenerationRetry) {
          return new Promise((resolve) => {
            boundary.resolveRegenerationRetry = () => resolve("Try Again");
            resolveRetryPromptShown();
          });
        }
        return undefined;
      },
    },
    workspace: {
      getConfiguration(configurationSection) {
        return {
          get(configurationKey, fallbackValue) {
            const fullConfigurationKey = `${configurationSection}.${configurationKey}`;
            if (boundary.configurationReadErrorKey === fullConfigurationKey) {
              throw boundary.configurationReadError;
            }
            return configurationValues.has(fullConfigurationKey)
              ? configurationValues.get(fullConfigurationKey)
              : (defaultConfigurationValues[fullConfigurationKey] ?? fallbackValue);
          },
          inspect(configurationKey) {
            const fullConfigurationKey = `${configurationSection}.${configurationKey}`;
            return {
              defaultValue: defaultConfigurationValues[fullConfigurationKey],
              globalValue: configurationValues.get(fullConfigurationKey),
              workspaceValue: undefined,
              workspaceFolderValue: undefined,
            };
          },
          async update(configurationKey, configurationValue) {
            if (
              configurationSection === "workbench" &&
              configurationKey === "colorTheme" &&
              boundary.deferColorThemeUpdate
            ) {
              resolveColorThemeUpdateStarted();
              await new Promise((resolve) => {
                boundary.resolveColorThemeUpdate = resolve;
              });
            }
            configurationValues.set(
              `${configurationSection}.${configurationKey}`,
              configurationValue
            );
          },
        };
      },
      onDidChangeConfiguration(configurationChangeHandler) {
        configurationChangeHandlers.push(configurationChangeHandler);
        return { dispose() {} };
      },
    },
    ConfigurationTarget: { Global: 1 },
  };
  boundary.configurationValues.set(
    "everforestComplete.themeGenerationFingerprint",
    themeGenerationSnapshot.fingerprint
  );
  Object.assign(globalThis.__everforestVscodeTestApi, boundary);
  return boundary;
}

function formatScheduleTime(scheduleDate) {
  return `${String(scheduleDate.getHours()).padStart(2, "0")}:${String(
    scheduleDate.getMinutes()
  ).padStart(2, "0")}`;
}

function createScheduleWithDarkThemeActive() {
  const currentDate = new Date();
  return [
    {
      time: formatScheduleTime(new Date(currentDate.getTime() + 2 * 60 * 1000)),
      theme: "Everforest Complete Light",
    },
    {
      time: formatScheduleTime(new Date(currentDate.getTime() - 2 * 60 * 1000)),
      theme: "Everforest Complete Dark",
    },
  ];
}

function createExtensionContext(boundary) {
  return {
    extensionPath: boundary.extensionRoot,
    extension: { packageJSON: { version: "1.5.0" } },
    subscriptions: [],
    globalState: {
      get(key) {
        return boundary.configurationValues.get(key);
      },
      async update(key, value) {
        boundary.configurationValues.set(key, value);
      },
    },
  };
}

async function activateForTest(boundary) {
  const extensionContext = createExtensionContext(boundary);
  await activate(extensionContext);
  return extensionContext;
}

function disposeExtension(extensionContext) {
  for (const subscription of extensionContext.subscriptions) subscription.dispose();
}

test("catches configuration UI and read failures at each native command boundary", async () => {
  for (const [commandIdentifier, expectedMessage] of [
    ["everforestComplete.configureTheme", "could not apply your choices"],
    ["everforestComplete.configureAdvancedControls", "could not apply advanced controls"],
    ["everforestComplete.configureAutomaticSwitching", "could not configure automatic switching"],
  ]) {
    const boundary = createVscodeBoundary();
    const extensionContext = await activateForTest(boundary);
    const expectedError = new Error("prompt unavailable");
    boundary.showQuickPickError = expectedError;

    await boundary.commandHandlers.get(commandIdentifier)();

    const errorNotification = boundary.calls.find(
      ({ operation, message }) =>
        operation === "showErrorMessage" && message.includes(expectedMessage)
    );
    assert.ok(errorNotification);
    assert.match(errorNotification.message, /prompt unavailable/);
    disposeExtension(extensionContext);
  }

  const boundary = createVscodeBoundary();
  const extensionContext = await activateForTest(boundary);
  const expectedError = new Error("settings unavailable");
  boundary.configurationReadErrorKey = "everforestComplete.darkContrast";
  boundary.configurationReadError = expectedError;

  await boundary.commandHandlers.get("everforestComplete.configureTheme")();

  const errorNotification = boundary.calls.find(
    ({ operation, message }) =>
      operation === "showErrorMessage" && message.includes("settings unavailable")
  );
  assert.ok(errorNotification);
  disposeExtension(extensionContext);
});

test("does not report regeneration success or retry after extension disposal", async () => {
  const boundary = createVscodeBoundary();
  const extensionContext = await activateForTest(boundary);
  const regenerateCommand = boundary.commandHandlers.get("everforestComplete.regenerateThemes");

  disposeExtension(extensionContext);
  await regenerateCommand();

  assert.equal(
    boundary.calls.some(
      ({ operation, message }) =>
        operation === "showInformationMessage" && message.includes("themes are current")
    ),
    false
  );
  assert.equal(
    boundary.calls.some(
      ({ operation, commandIdentifier }) =>
        operation === "executeCommand" &&
        commandIdentifier === "everforestComplete.regenerateThemes"
    ),
    false
  );

  const retryBoundary = createVscodeBoundary();
  const retryContext = await activateForTest(retryBoundary);
  retryBoundary.deferRegenerationRetry = true;
  rmSync(join(retryBoundary.extensionRoot, "themes"), { recursive: true, force: true });
  const retryCommandPromise = retryBoundary.commandHandlers.get(
    "everforestComplete.regenerateThemes"
  )();
  await retryBoundary.retryPromptShown;
  assert.equal(
    typeof retryBoundary.resolveRegenerationRetry,
    "function",
    JSON.stringify(retryBoundary.calls)
  );
  disposeExtension(retryContext);
  retryBoundary.resolveRegenerationRetry();
  await retryCommandPromise;

  assert.equal(
    retryBoundary.calls.some(
      ({ operation, commandIdentifier }) =>
        operation === "executeCommand" &&
        commandIdentifier === "everforestComplete.regenerateThemes"
    ),
    false
  );
});

test("does not roll back an accepted theme write after scheduling is disabled", async () => {
  const boundary = createVscodeBoundary();
  boundary.configurationValues.set("workbench.colorTheme", "Everforest Complete Light");
  boundary.configurationValues.set("everforestComplete.autoSwitch.enabled", true);
  boundary.configurationValues.set(
    "everforestComplete.autoSwitch.schedule",
    createScheduleWithDarkThemeActive()
  );
  boundary.deferColorThemeUpdate = true;

  const extensionContext = await activateForTest(boundary);
  await boundary.colorThemeUpdateStarted;

  boundary.configurationValues.set("everforestComplete.autoSwitch.enabled", false);
  for (const configurationChangeHandler of boundary.configurationChangeHandlers) {
    configurationChangeHandler({
      affectsConfiguration(configurationKey) {
        return configurationKey === "everforestComplete.autoSwitch";
      },
    });
  }
  boundary.deferColorThemeUpdate = false;
  boundary.resolveColorThemeUpdate();

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    boundary.configurationValues.get("workbench.colorTheme"),
    "Everforest Complete Dark"
  );
  disposeExtension(extensionContext);
});
