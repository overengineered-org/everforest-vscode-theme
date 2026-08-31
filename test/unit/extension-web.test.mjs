import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  activate,
  createWebConfigurationController,
  explainDesktopConfigurationRequirement,
} from "../../dist/extension-web.js";

let defaultVscodeBoundaryHookRegistered = false;

function registerDefaultVscodeBoundaryHook() {
  if (defaultVscodeBoundaryHookRegistered) return;
  const fakeVscodeModuleSource = [
    "module.exports = {",
    "commands: {",
    "  registerCommand() { return { dispose() {} }; },",
    "  async executeCommand() {},",
    "},",
    "window: { async showInformationMessage() {} },",
    "workspace: {",
    "  onDidChangeConfiguration() { return { dispose() {} }; },",
    "},",
    "};",
  ].join("\n");
  const fakeVscodeModuleUrl = "file:///virtual/everforest-vscode-test.cjs";
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "vscode") {
        return { shortCircuit: true, url: fakeVscodeModuleUrl };
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url === fakeVscodeModuleUrl) {
        return { format: "commonjs", shortCircuit: true, source: fakeVscodeModuleSource };
      }
      return nextLoad(url, context);
    },
  });
  defaultVscodeBoundaryHookRegistered = true;
}

function createWebHost(selectedAction) {
  const calls = [];
  return {
    calls,
    async showInformationMessage(message, action) {
      calls.push({ operation: "showInformationMessage", message, action });
      return selectedAction;
    },
    async executeCommand(command) {
      calls.push({ operation: "executeCommand", command });
    },
  };
}

function createWebActivationBoundary(selectedAction) {
  const calls = [];
  const commandHandlers = new Map();
  const configurationChangeHandlers = [];
  const disposables = [];
  return {
    calls,
    commandHandlers,
    configurationChangeHandlers,
    disposables,
    commands: {
      registerCommand(commandIdentifier, commandHandler) {
        commandHandlers.set(commandIdentifier, commandHandler);
        const disposable = { dispose: () => undefined };
        disposables.push(disposable);
        return disposable;
      },
      async executeCommand(commandIdentifier) {
        calls.push({ operation: "executeCommand", commandIdentifier });
      },
    },
    window: {
      async showInformationMessage(message, action) {
        calls.push({ operation: "showInformationMessage", message, action });
        return selectedAction;
      },
    },
    workspace: {
      onDidChangeConfiguration(configurationChangeHandler) {
        configurationChangeHandlers.push(configurationChangeHandler);
        const disposable = { dispose: () => undefined };
        disposables.push(disposable);
        return disposable;
      },
    },
  };
}

test("emits a self-contained browser entry without local CommonJS imports", () => {
  const browserEntrySource = readFileSync(
    new URL("../../dist/extension-web.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(browserEntrySource, /\brequire\(["']\.\.?[\\/]/);
  assert.match(browserEntrySource, /require\(["']vscode["']\)/);
  assert.doesNotMatch(browserEntrySource, /import\(["']vscode["']\)/);
  assert.doesNotMatch(browserEntrySource, /extension-web-controller/);
});

test("web configuration controller offers fixed-theme selection without forcing it", async () => {
  const webHost = createWebHost(undefined);
  const webConfigurationController = createWebConfigurationController(webHost);

  await webConfigurationController.explainDesktopConfigurationRequirement();

  assert.equal(webHost.calls.length, 1);
  assert.equal(webHost.calls[0].operation, "showInformationMessage");
});

test("web configuration controller opens the native theme picker when chosen", async () => {
  const webHost = createWebHost("Choose Fixed Theme");
  const webConfigurationController = createWebConfigurationController(webHost);

  await webConfigurationController.explainDesktopConfigurationRequirement();

  assert.deepEqual(webHost.calls.at(-1), {
    operation: "executeCommand",
    command: "workbench.action.selectTheme",
  });
});

test("web configuration controller propagates notification failures", async () => {
  const expectedError = new Error("notification unavailable");
  const webHost = {
    async showInformationMessage() {
      throw expectedError;
    },
    async executeCommand() {},
  };
  const webConfigurationController = createWebConfigurationController(webHost);

  await assert.rejects(
    () => webConfigurationController.explainDesktopConfigurationRequirement(),
    expectedError
  );
});

test("web activation and explanation lazy-load the default VS Code boundary", async () => {
  registerDefaultVscodeBoundaryHook();

  const extensionContext = { subscriptions: [] };
  await activate(extensionContext);
  await explainDesktopConfigurationRequirement();

  assert.equal(extensionContext.subscriptions.length, 5);
});

test("web activation propagates command registration failures", async () => {
  const expectedError = new Error("command registration unavailable");
  const webActivationBoundary = createWebActivationBoundary(undefined);
  webActivationBoundary.commands.registerCommand = () => {
    throw expectedError;
  };

  await assert.rejects(() => activate({ subscriptions: [] }, webActivationBoundary), expectedError);
});

test("web activation registers every contributed command through the VS Code boundary", async () => {
  const webActivationBoundary = createWebActivationBoundary(undefined);
  const extensionContext = { subscriptions: [] };

  await activate(extensionContext, webActivationBoundary);

  assert.deepEqual(
    [...webActivationBoundary.commandHandlers.keys()],
    [
      "everforestComplete.configureTheme",
      "everforestComplete.configureAdvancedControls",
      "everforestComplete.configureAutomaticSwitching",
      "everforestComplete.regenerateThemes",
    ]
  );
  assert.equal(extensionContext.subscriptions.length, 5);
  assert.equal(webActivationBoundary.disposables.length, 5);
});

test("web activation forwards the fixed-theme action through the registered command", async () => {
  const webActivationBoundary = createWebActivationBoundary("Choose Fixed Theme");
  const extensionContext = { subscriptions: [] };

  await activate(extensionContext, webActivationBoundary);
  await webActivationBoundary.commandHandlers.get("everforestComplete.configureTheme")();

  assert.deepEqual(webActivationBoundary.calls.at(-1), {
    operation: "executeCommand",
    commandIdentifier: "workbench.action.selectTheme",
  });
});

test("web activation routes commands and scoped configuration changes through the boundary", async () => {
  const webActivationBoundary = createWebActivationBoundary(undefined);
  const extensionContext = { subscriptions: [] };

  await activate(extensionContext, webActivationBoundary);
  for (const commandHandler of webActivationBoundary.commandHandlers.values()) {
    await commandHandler();
  }
  assert.equal(
    webActivationBoundary.calls.filter(({ operation }) => operation === "showInformationMessage")
      .length,
    4
  );

  webActivationBoundary.configurationChangeHandlers[0]({
    affectsConfiguration: () => false,
  });
  assert.equal(webActivationBoundary.calls.length, 4);
  webActivationBoundary.configurationChangeHandlers[0]({
    affectsConfiguration: (configurationSection) => configurationSection === "everforestComplete",
  });
  assert.deepEqual(webActivationBoundary.calls.at(-1), {
    operation: "showInformationMessage",
    message: "Everforest Complete premium settings apply in VS Code Desktop.",
    action: undefined,
  });
});
