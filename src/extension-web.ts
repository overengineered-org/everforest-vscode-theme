import * as vscode from "vscode";

async function explainDesktopConfigurationRequirement(): Promise<void> {
  const chooseFixedThemeAction = "Choose Fixed Theme";
  const selectedAction = await vscode.window.showInformationMessage(
    "Everforest Complete configuration controls require VS Code Desktop. All fixed themes work here.",
    chooseFixedThemeAction
  );
  if (selectedAction === chooseFixedThemeAction) {
    await vscode.commands.executeCommand("workbench.action.selectTheme");
  }
}

export function activate(extensionContext: vscode.ExtensionContext): void {
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand("everforestComplete.configureTheme", () =>
      explainDesktopConfigurationRequirement()
    ),
    vscode.commands.registerCommand("everforestComplete.configureAdvancedControls", () =>
      explainDesktopConfigurationRequirement()
    ),
    vscode.commands.registerCommand("everforestComplete.configureAutomaticSwitching", () =>
      explainDesktopConfigurationRequirement()
    ),
    vscode.commands.registerCommand("everforestComplete.regenerateThemes", () =>
      explainDesktopConfigurationRequirement()
    ),
    vscode.workspace.onDidChangeConfiguration((configurationChange) => {
      if (!configurationChange.affectsConfiguration("everforestComplete")) return;
      void vscode.window.showInformationMessage(
        "Everforest Complete premium settings apply in VS Code Desktop."
      );
    })
  );
}
