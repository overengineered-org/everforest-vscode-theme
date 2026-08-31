import type * as vscode from "vscode";

export interface WebConfigurationControllerHost {
  showInformationMessage(message: string, action: string): Thenable<string | undefined>;
  executeCommand(command: string): Thenable<unknown>;
}

export function createWebConfigurationController(
  webConfigurationControllerHost: WebConfigurationControllerHost
): { explainDesktopConfigurationRequirement(): Promise<void> } {
  return {
    async explainDesktopConfigurationRequirement(): Promise<void> {
      const chooseFixedThemeAction = "Choose Fixed Theme";
      const selectedAction = await webConfigurationControllerHost.showInformationMessage(
        "Everforest Complete configuration controls require VS Code Desktop. All fixed themes work here.",
        chooseFixedThemeAction
      );
      if (selectedAction === chooseFixedThemeAction) {
        await webConfigurationControllerHost.executeCommand("workbench.action.selectTheme");
      }
    },
  };
}

export interface WebExtensionVscodeBoundary {
  commands: {
    registerCommand(
      commandIdentifier: string,
      commandHandler: (...commandArguments: unknown[]) => unknown
    ): vscode.Disposable;
    executeCommand(commandIdentifier: string): Thenable<unknown>;
  };
  window: {
    showInformationMessage(message: string, action?: string): Thenable<string | undefined>;
  };
  workspace: {
    onDidChangeConfiguration(
      configurationChangeHandler: (configurationChange: vscode.ConfigurationChangeEvent) => unknown
    ): vscode.Disposable;
  };
}

function createVscodeWebConfigurationHost(
  webExtensionVscodeBoundary: WebExtensionVscodeBoundary
): WebConfigurationControllerHost {
  return {
    showInformationMessage: (message, action) =>
      webExtensionVscodeBoundary.window.showInformationMessage(message, action),
    executeCommand: (command) => webExtensionVscodeBoundary.commands.executeCommand(command),
  };
}

function loadVscodeWebExtensionBoundary(): WebExtensionVscodeBoundary {
  // VS Code Web Workers provide this one runtime module through their CommonJS shim.
  // Local extension modules must remain in this compiled entry file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscodeApi = require("vscode") as typeof vscode;
  return {
    commands: vscodeApi.commands,
    window: vscodeApi.window,
    workspace: vscodeApi.workspace,
  };
}

function loadVscodeWebConfigurationHost(): WebConfigurationControllerHost {
  return createVscodeWebConfigurationHost(loadVscodeWebExtensionBoundary());
}

export async function explainDesktopConfigurationRequirement(
  webConfigurationControllerHost?: WebConfigurationControllerHost
): Promise<void> {
  const webConfigurationController = createWebConfigurationController(
    webConfigurationControllerHost ?? loadVscodeWebConfigurationHost()
  );
  await webConfigurationController.explainDesktopConfigurationRequirement();
}

export async function activate(
  extensionContext: vscode.ExtensionContext,
  webExtensionVscodeBoundary?: WebExtensionVscodeBoundary
): Promise<void> {
  const resolvedWebExtensionVscodeBoundary =
    webExtensionVscodeBoundary ?? loadVscodeWebExtensionBoundary();
  const webConfigurationController = createWebConfigurationController(
    createVscodeWebConfigurationHost(resolvedWebExtensionVscodeBoundary)
  );
  const explainConfigurationRequirement = () =>
    webConfigurationController.explainDesktopConfigurationRequirement();

  extensionContext.subscriptions.push(
    resolvedWebExtensionVscodeBoundary.commands.registerCommand(
      "everforestComplete.configureTheme",
      explainConfigurationRequirement
    ),
    resolvedWebExtensionVscodeBoundary.commands.registerCommand(
      "everforestComplete.configureAdvancedControls",
      explainConfigurationRequirement
    ),
    resolvedWebExtensionVscodeBoundary.commands.registerCommand(
      "everforestComplete.configureAutomaticSwitching",
      explainConfigurationRequirement
    ),
    resolvedWebExtensionVscodeBoundary.commands.registerCommand(
      "everforestComplete.regenerateThemes",
      explainConfigurationRequirement
    ),
    resolvedWebExtensionVscodeBoundary.workspace.onDidChangeConfiguration((configurationChange) => {
      if (!configurationChange.affectsConfiguration("everforestComplete")) return;
      void resolvedWebExtensionVscodeBoundary.window.showInformationMessage(
        "Everforest Complete premium settings apply in VS Code Desktop."
      );
    })
  );
}
