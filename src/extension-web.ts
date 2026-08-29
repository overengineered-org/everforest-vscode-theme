import * as vscode from "vscode";

export function activate(extensionContext: vscode.ExtensionContext): void {
  extensionContext.subscriptions.push(
    vscode.commands.registerCommand("everforestComplete.openSettings", () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:overengineered-org.everforest-complete"
      )
    ),
    vscode.commands.registerCommand("everforestComplete.regenerateThemes", () =>
      vscode.window.showInformationMessage(
        "Premium theme regeneration requires VS Code Desktop. All committed themes still work here."
      )
    ),
    vscode.workspace.onDidChangeConfiguration((configurationChange) => {
      if (!configurationChange.affectsConfiguration("everforestComplete")) return;
      void vscode.window.showInformationMessage(
        "Everforest Complete premium settings apply in VS Code Desktop."
      );
    })
  );
}
