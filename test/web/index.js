const vscode = require("vscode");

const extensionIdentifier = "overengineered-org.everforest-complete";

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actualValue, expectedValue, message) {
  if (actualValue !== expectedValue) {
    throw new Error(`${message}: expected ${expectedValue}, received ${actualValue}`);
  }
}

async function run() {
  const extension = vscode.extensions.getExtension(extensionIdentifier);
  assertCondition(extension, "Theme extension is registered in VS Code Web");
  assertEqual(extension.packageJSON.main, undefined, "Extension has no desktop runtime");
  assertEqual(extension.packageJSON.browser, undefined, "Extension has no web runtime");
  assertEqual(extension.packageJSON.contributes.themes.length, 6, "Theme contribution count");
  assertEqual(
    extension.packageJSON.capabilities.virtualWorkspaces,
    true,
    "Virtual workspace support"
  );
  assertEqual(
    extension.packageJSON.capabilities.untrustedWorkspaces.supported,
    true,
    "Untrusted workspace support"
  );

  for (const themeContribution of extension.packageJSON.contributes.themes) {
    const themeResource = vscode.Uri.joinPath(extension.extensionUri, themeContribution.path);
    const serializedTheme = await vscode.workspace.fs.readFile(themeResource);
    const theme = JSON.parse(new TextDecoder().decode(serializedTheme));
    assertEqual(theme.name, themeContribution.label, "Theme label");
    assertCondition(theme.colors["editor.background"], "Theme has an editor background");
  }

  const workspaceScheme = vscode.workspace.workspaceFolders?.[0]?.uri.scheme;
  assertEqual(workspaceScheme, "vscode-test-web", "Virtual workspace scheme");
  console.log("Validated six themes in a VS Code Web virtual workspace.");
}

module.exports = { run };
