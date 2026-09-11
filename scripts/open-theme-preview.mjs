import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryDirectory = resolve(import.meta.dirname, "..");
const supportedPreviewAppearances = new Set(["dark", "light"]);
const previewFixtureFileNames = [
  "showcase.java",
  "showcase.cs",
  "showcase.cpp",
  "showcase.go",
  "showcase.swift",
  "showcase.php",
  "showcase.rb",
  "showcase.sql",
  "showcase.scss",
  "showcase.rs",
  "showcase.py",
  "showcase.tsx",
];

export function themeNameForPreviewAppearance(previewAppearance) {
  if (!supportedPreviewAppearances.has(previewAppearance)) {
    throw new Error(`Preview appearance must be light or dark, received ${previewAppearance}`);
  }

  return previewAppearance === "light"
    ? "Everforest Complete Light Medium"
    : "Everforest Complete Dark Medium";
}

export function createThemePreviewSettings(previewAppearance) {
  const previewThemeName = themeNameForPreviewAppearance(previewAppearance);

  return {
    "breadcrumbs.enabled": false,
    "chat.disableAIFeatures": true,
    "editor.fontSize": 18,
    "editor.lineHeight": 28,
    "editor.minimap.enabled": false,
    "editor.lightbulb.enabled": "off",
    "editor.renderValidationDecorations": "off",
    "editor.renderWhitespace": "none",
    "extensions.autoCheckUpdates": false,
    "extensions.autoUpdate": false,
    "extensions.ignoreRecommendations": true,
    "php.validate.enable": false,
    "security.workspace.trust.enabled": false,
    "telemetry.telemetryLevel": "off",
    "update.mode": "none",
    "window.commandCenter": false,
    "window.autoDetectColorScheme": false,
    "window.zoomLevel": 1,
    "workbench.activityBar.location": "hidden",
    "workbench.colorTheme": previewThemeName,
    "workbench.editor.decorations.badges": false,
    "workbench.editor.decorations.colors": false,
    "workbench.editor.enablePreview": false,
    "workbench.editor.wrapTabs": true,
    "workbench.layoutControl.enabled": false,
    "workbench.preferredDarkColorTheme": "Everforest Complete Dark Medium",
    "workbench.preferredLightColorTheme": "Everforest Complete Light Medium",
    "workbench.startupEditor": "none",
    "workbench.statusBar.visible": false,
    "git.decorations.enabled": false,
  };
}

export function createThemePreviewControllerManifest() {
  return {
    name: "everforest-theme-preview-controller",
    displayName: "Everforest Theme Preview Controller",
    publisher: "overengineered-preview",
    version: "0.0.0",
    engines: { vscode: "^1.90.0" },
    activationEvents: ["onStartupFinished"],
    main: "./extension.cjs",
  };
}

export function createThemePreviewControllerSource(previewAppearance) {
  const previewThemeName = JSON.stringify(themeNameForPreviewAppearance(previewAppearance));
  return `const vscode = require("vscode");

exports.activate = async function activateEverforestThemePreview() {
  await vscode.workspace
    .getConfiguration("workbench")
    .update("colorTheme", ${previewThemeName}, vscode.ConfigurationTarget.Global);
};
`;
}

export function createThemePreviewArguments(previewAppearance, previewStateDirectory) {
  themeNameForPreviewAppearance(previewAppearance);
  const previewFixturePaths = previewFixtureFileNames.map((previewFixtureName) =>
    resolve(repositoryDirectory, "fixtures", previewFixtureName)
  );

  return [
    "--new-window",
    `--user-data-dir=${resolve(previewStateDirectory, "user-data")}`,
    `--extensions-dir=${resolve(previewStateDirectory, "extensions")}`,
    "--disable-telemetry",
    "--disable-updates",
    "--skip-release-notes",
    "--skip-welcome",
    "--disable-workspace-trust",
    `--extensionDevelopmentPath=${resolve(previewStateDirectory, "preview-controller")}`,
    ...previewFixturePaths,
  ];
}

export function resolveVisualStudioCodeLauncher() {
  if (process.env.VSCODE_EXECUTABLE_PATH) return process.env.VSCODE_EXECUTABLE_PATH;

  return process.platform === "win32" ? "code.cmd" : "code";
}

export function createThemePreviewLaunch(previewAppearance, previewStateDirectory) {
  const visualStudioCodeArguments = createThemePreviewArguments(
    previewAppearance,
    previewStateDirectory
  );
  const macOsVisualStudioCodeApplication = "/Applications/Visual Studio Code.app";

  if (
    process.platform === "darwin" &&
    !process.env.VSCODE_EXECUTABLE_PATH &&
    existsSync(macOsVisualStudioCodeApplication)
  ) {
    return {
      command: "open",
      arguments: ["-n", "-a", "Visual Studio Code", "--args", ...visualStudioCodeArguments],
    };
  }

  return {
    command: resolveVisualStudioCodeLauncher(),
    arguments: visualStudioCodeArguments,
  };
}

export function openThemePreview(previewAppearance) {
  const previewTemporaryRootDirectory = process.platform === "darwin" ? "/tmp" : tmpdir();
  const previewStateDirectory = mkdtempSync(
    resolve(previewTemporaryRootDirectory, "everforest-preview-")
  );
  const previewUserSettingsDirectory = resolve(previewStateDirectory, "user-data", "User");
  const previewExtensionsDirectory = resolve(previewStateDirectory, "extensions");
  const previewControllerDirectory = resolve(previewStateDirectory, "preview-controller");
  const previewExtensionLink = resolve(
    previewExtensionsDirectory,
    "overengineered-org.everforest-complete-preview"
  );
  mkdirSync(previewUserSettingsDirectory, { recursive: true });
  mkdirSync(previewExtensionsDirectory, { recursive: true });
  mkdirSync(previewControllerDirectory, { recursive: true });
  symlinkSync(
    repositoryDirectory,
    previewExtensionLink,
    process.platform === "win32" ? "junction" : "dir"
  );
  writeFileSync(
    resolve(previewUserSettingsDirectory, "settings.json"),
    `${JSON.stringify(createThemePreviewSettings(previewAppearance), null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    resolve(previewControllerDirectory, "package.json"),
    `${JSON.stringify(createThemePreviewControllerManifest(), null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    resolve(previewControllerDirectory, "extension.cjs"),
    createThemePreviewControllerSource(previewAppearance),
    "utf8"
  );

  const previewLaunch = createThemePreviewLaunch(previewAppearance, previewStateDirectory);

  if (previewLaunch.command === "open") {
    const completedPreviewLaunch = spawnSync(previewLaunch.command, previewLaunch.arguments, {
      stdio: "ignore",
    });
    if (completedPreviewLaunch.error) throw completedPreviewLaunch.error;
    if (completedPreviewLaunch.status !== 0) {
      throw new Error(`VS Code preview launch failed with status ${completedPreviewLaunch.status}`);
    }
    return;
  }

  const previewProcess = spawn(previewLaunch.command, previewLaunch.arguments, {
    detached: true,
    stdio: "ignore",
  });
  previewProcess.unref();
}

const invokedScriptPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedScriptPath === fileURLToPath(import.meta.url)) {
  openThemePreview(process.argv[2] ?? "light");
}
