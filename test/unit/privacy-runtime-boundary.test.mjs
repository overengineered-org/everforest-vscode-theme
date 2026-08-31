import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const fakeVscodeModulePath = join(
  mkdtempSync(join(tmpdir(), "everforest-privacy-vscode-boundary-")),
  "vscode.cjs"
);
writeFileSync(fakeVscodeModulePath, "module.exports = globalThis.__everforestPrivacyVscodeApi;\n");
globalThis.__everforestPrivacyVscodeApi = {
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

const { activate: activateDesktopExtension } =
  await import("../../dist/extension.js?privacy-runtime-boundary");

const allowedConfigurationSections = new Set(["everforestComplete", "window", "workbench"]);
const allowedConfigurationKeys = new Set([
  "everforestComplete.darkContrast",
  "everforestComplete.lightContrast",
  "everforestComplete.darkWorkbench",
  "everforestComplete.lightWorkbench",
  "everforestComplete.darkCursor",
  "everforestComplete.lightCursor",
  "everforestComplete.darkSelection",
  "everforestComplete.lightSelection",
  "everforestComplete.italicKeywords",
  "everforestComplete.italicComments",
  "everforestComplete.diagnosticTextBackgroundOpacity",
  "everforestComplete.highContrast",
  "everforestComplete.autoSwitch.enabled",
  "everforestComplete.autoSwitch.schedule",
  "window.autoDetectColorScheme",
  "workbench.colorTheme",
  "workbench.preferredDarkColorTheme",
  "workbench.preferredLightColorTheme",
]);
const allowedGlobalStateKeys = new Set();

function createStrictWorkspaceBoundary(configurationState, boundaryCalls) {
  const createConfiguration = (configurationSection) => {
    if (!allowedConfigurationSections.has(configurationSection)) {
      throw new Error(`Unexpected VS Code configuration section: ${configurationSection}`);
    }
    return {
      get(configurationKey, fallbackValue) {
        const fullConfigurationKey = `${configurationSection}.${configurationKey}`;
        if (!allowedConfigurationKeys.has(fullConfigurationKey)) {
          throw new Error(`Unexpected VS Code configuration read: ${fullConfigurationKey}`);
        }
        boundaryCalls.push({ operation: "readConfiguration", fullConfigurationKey });
        return configurationState.has(fullConfigurationKey)
          ? configurationState.get(fullConfigurationKey)
          : fallbackValue;
      },
      inspect(configurationKey) {
        const fullConfigurationKey = `${configurationSection}.${configurationKey}`;
        if (!allowedConfigurationKeys.has(fullConfigurationKey)) {
          throw new Error(`Unexpected VS Code configuration inspection: ${fullConfigurationKey}`);
        }
        boundaryCalls.push({ operation: "inspectConfiguration", fullConfigurationKey });
        return {
          defaultValue: undefined,
          globalValue: configurationState.get(fullConfigurationKey),
          workspaceValue: undefined,
          workspaceFolderValue: undefined,
        };
      },
      async update(configurationKey, configurationValue, configurationTarget) {
        const fullConfigurationKey = `${configurationSection}.${configurationKey}`;
        if (!allowedConfigurationKeys.has(fullConfigurationKey)) {
          throw new Error(`Unexpected VS Code configuration write: ${fullConfigurationKey}`);
        }
        boundaryCalls.push({
          operation: "updateConfiguration",
          fullConfigurationKey,
          configurationValue,
          configurationTarget,
        });
        configurationState.set(fullConfigurationKey, configurationValue);
      },
    };
  };

  return new Proxy(
    {
      getConfiguration: createConfiguration,
      onDidChangeConfiguration(configurationChangeHandler) {
        boundaryCalls.push({
          operation: "registerConfigurationChange",
          configurationChangeHandler,
        });
        return { dispose() {} };
      },
    },
    {
      get(target, property, receiver) {
        if (typeof property === "symbol" || property in target) {
          return Reflect.get(target, property, receiver);
        }
        boundaryCalls.push({ operation: "forbiddenWorkspaceApi", property: String(property) });
        throw new Error(`Forbidden VS Code workspace API: ${String(property)}`);
      },
    }
  );
}

function createDesktopBoundary() {
  const boundaryCalls = [];
  const configurationState = new Map();
  const commandHandlers = new Map();
  const globalStateValues = new Map();
  const extensionRoot = mkdtempSync(join(tmpdir(), "everforest-privacy-extension-"));
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

  const desktopVscodeBoundary = {
    boundaryCalls,
    commandHandlers,
    extensionRoot,
    globalState: {
      get(globalStateKey) {
        if (!allowedGlobalStateKeys.has(globalStateKey)) {
          throw new Error(`Unexpected VS Code global state read: ${globalStateKey}`);
        }
        boundaryCalls.push({ operation: "readGlobalState", globalStateKey });
        return globalStateValues.get(globalStateKey);
      },
      async update(globalStateKey, globalStateValue) {
        if (!allowedGlobalStateKeys.has(globalStateKey)) {
          throw new Error(`Unexpected VS Code global state write: ${globalStateKey}`);
        }
        boundaryCalls.push({ operation: "updateGlobalState", globalStateKey, globalStateValue });
        globalStateValues.set(globalStateKey, globalStateValue);
      },
    },
    commands: {
      registerCommand(commandIdentifier, commandHandler) {
        commandHandlers.set(commandIdentifier, commandHandler);
        return { dispose() {} };
      },
      async executeCommand(commandIdentifier) {
        boundaryCalls.push({ operation: "executeCommand", commandIdentifier });
      },
    },
    window: {
      async showQuickPick(items) {
        const requestedConfigurationValue = ["dark", "soft", "flat"][
          desktopVscodeBoundary.guidedQuickPickIndex
        ];
        desktopVscodeBoundary.guidedQuickPickIndex += 1;
        return items.find((item) => item.configurationValue === requestedConfigurationValue);
      },
      async showInputBox() {
        return undefined;
      },
      async showInformationMessage() {
        return undefined;
      },
      async showWarningMessage() {},
      async showErrorMessage() {
        return undefined;
      },
    },
    ConfigurationTarget: { Global: 1 },
    guidedQuickPickIndex: 0,
  };
  desktopVscodeBoundary.workspace = createStrictWorkspaceBoundary(
    configurationState,
    boundaryCalls
  );
  Object.assign(globalThis.__everforestPrivacyVscodeApi, desktopVscodeBoundary);
  return desktopVscodeBoundary;
}

function createDesktopExtensionContext(desktopVscodeBoundary) {
  return {
    extensionPath: desktopVscodeBoundary.extensionRoot,
    extension: { packageJSON: { version: "0.0.0-development" } },
    subscriptions: [],
    globalState: desktopVscodeBoundary.globalState,
  };
}

function disposeDesktopExtension(extensionContext) {
  for (const extensionSubscription of extensionContext.subscriptions) {
    extensionSubscription.dispose();
  }
}

function installNetworkTrap() {
  const originalFetch = globalThis.fetch;
  const networkAccessAttempts = [];
  globalThis.fetch = () => {
    networkAccessAttempts.push("fetch");
    throw new Error("Network access is outside the Everforest runtime boundary");
  };
  return {
    networkAccessAttempts,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("desktop activation uses only app-wide settings and the installed theme files", async () => {
  const desktopBoundary = createDesktopBoundary();
  const networkTrap = installNetworkTrap();
  try {
    const extensionContext = createDesktopExtensionContext(desktopBoundary);
    await activateDesktopExtension(extensionContext);
    await desktopBoundary.commandHandlers.get("everforestComplete.configureTheme")();

    const configurationWrites = desktopBoundary.boundaryCalls.filter(
      ({ operation }) => operation === "updateConfiguration"
    );
    assert.ok(configurationWrites.length > 0);
    assert.ok(
      configurationWrites.every(
        ({ fullConfigurationKey, configurationTarget }) =>
          allowedConfigurationKeys.has(fullConfigurationKey) && configurationTarget === 1
      ),
      JSON.stringify(configurationWrites)
    );
    assert.ok(
      desktopBoundary.boundaryCalls
        .filter(
          ({ operation }) =>
            operation === "readConfiguration" || operation === "inspectConfiguration"
        )
        .every(({ fullConfigurationKey }) => allowedConfigurationKeys.has(fullConfigurationKey))
    );
    assert.deepEqual(
      desktopBoundary.boundaryCalls.filter(
        ({ operation }) => operation === "forbiddenWorkspaceApi"
      ),
      []
    );
    assert.deepEqual(networkTrap.networkAccessAttempts, []);
    assert.deepEqual(
      desktopBoundary.boundaryCalls
        .filter(({ operation }) => operation === "updateGlobalState")
        .map(({ globalStateKey }) => globalStateKey),
      [],
      JSON.stringify(desktopBoundary.boundaryCalls)
    );
    disposeDesktopExtension(extensionContext);
  } finally {
    networkTrap.restore();
    rmSync(desktopBoundary.extensionRoot, { recursive: true, force: true });
  }
});

test("web activation has a fixed command boundary without filesystem or network runtime imports", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const nodeModule = require("node:module");
  const originalModuleLoad = nodeModule._load;
  const blockedBuiltinRequests = [];
  nodeModule._load = function (request, requestingModule, isEntryPoint) {
    if (
      [
        "fs",
        "fs/promises",
        "node:fs",
        "node:fs/promises",
        "node:child_process",
        "child_process",
        "node:http",
        "node:https",
        "http",
        "https",
      ].includes(request)
    ) {
      blockedBuiltinRequests.push(request);
      throw new Error(`Forbidden web runtime import: ${request}`);
    }
    return originalModuleLoad.call(this, request, requestingModule, isEntryPoint);
  };
  const networkTrap = installNetworkTrap();
  try {
    const { activate: activateWebExtension } =
      await import("../../dist/extension-web.js?privacy-web-runtime-boundary");
    const commandHandlers = new Map();
    const webBoundaryCalls = [];
    const webVscodeBoundary = {
      commands: {
        registerCommand(commandIdentifier, commandHandler) {
          commandHandlers.set(commandIdentifier, commandHandler);
          return { dispose() {} };
        },
        async executeCommand(commandIdentifier) {
          webBoundaryCalls.push({ operation: "executeCommand", commandIdentifier });
        },
      },
      window: {
        async showInformationMessage() {
          webBoundaryCalls.push({ operation: "showInformationMessage" });
          return undefined;
        },
      },
      workspace: new Proxy(
        {
          onDidChangeConfiguration(configurationChangeHandler) {
            webBoundaryCalls.push({
              operation: "registerConfigurationChange",
              configurationChangeHandler,
            });
            return { dispose() {} };
          },
        },
        {
          get(target, property, receiver) {
            if (typeof property === "symbol" || property in target) {
              return Reflect.get(target, property, receiver);
            }
            webBoundaryCalls.push({
              operation: "forbiddenWorkspaceApi",
              property: String(property),
            });
            throw new Error(`Forbidden VS Code web workspace API: ${String(property)}`);
          },
        }
      ),
    };
    const extensionContext = { subscriptions: [] };
    await activateWebExtension(extensionContext, webVscodeBoundary);
    for (const commandHandler of commandHandlers.values()) await commandHandler();

    assert.deepEqual(
      [...commandHandlers.keys()],
      [
        "everforestComplete.configureTheme",
        "everforestComplete.configureAdvancedControls",
        "everforestComplete.configureAutomaticSwitching",
        "everforestComplete.regenerateThemes",
      ]
    );
    assert.equal(extensionContext.subscriptions.length, 5);
    assert.deepEqual(blockedBuiltinRequests, []);
    assert.deepEqual(
      webBoundaryCalls.filter(({ operation }) => operation === "forbiddenWorkspaceApi"),
      []
    );
    assert.deepEqual(networkTrap.networkAccessAttempts, []);
    assert.equal(
      webBoundaryCalls.some(({ operation }) => operation === "executeCommand"),
      false
    );
  } finally {
    networkTrap.restore();
    nodeModule._load = originalModuleLoad;
  }
});
