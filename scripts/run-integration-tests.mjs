import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { downloadAndUnzipVSCode, runTests, runVSCodeCommand } from "@vscode/test-electron";

const repositoryDirectory = resolve(import.meta.dirname, "..");
const temporaryFilesDirectory = process.platform === "darwin" ? "/tmp" : tmpdir();
const vscodeTestStateDirectory = mkdtempSync(resolve(temporaryFilesDirectory, "evf-"));
const isolatedExtensionsDirectory = resolve(vscodeTestStateDirectory, "extensions");
const isolatedUserDataDirectory = resolve(vscodeTestStateDirectory, "user-data");
const packagedExtensionPath = resolve(repositoryDirectory, "dist", "everforest-complete.vsix");

function writeSystemThemeSettings(autoDetectColorScheme) {
  const userSettingsDirectory = resolve(isolatedUserDataDirectory, "User");
  mkdirSync(userSettingsDirectory, { recursive: true });
  writeFileSync(
    resolve(userSettingsDirectory, "settings.json"),
    `${JSON.stringify(
      {
        "window.autoDetectColorScheme": autoDetectColorScheme,
        "workbench.preferredDarkColorTheme": "Everforest Complete Dark Medium",
        "workbench.preferredLightColorTheme": "Everforest Complete Light Medium",
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function runExtensionHost(vscodeExecutablePath, integrationTestMode) {
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: resolve(repositoryDirectory, "test", "harness"),
    extensionTestsPath: resolve(repositoryDirectory, "test", "integration", "index.js"),
    extensionTestsEnv: { EVERFOREST_INTEGRATION_TEST_MODE: integrationTestMode },
    launchArgs: [
      resolve(repositoryDirectory, "fixtures"),
      `--user-data-dir=${isolatedUserDataDirectory}`,
      `--extensions-dir=${isolatedExtensionsDirectory}`,
      "--disable-crash-reporter",
      "--disable-telemetry",
    ],
  });
}

try {
  const vscodeExecutablePath = await downloadAndUnzipVSCode("stable");
  await runVSCodeCommand(
    [
      "--install-extension",
      packagedExtensionPath,
      "--force",
      `--extensions-dir=${isolatedExtensionsDirectory}`,
      `--user-data-dir=${isolatedUserDataDirectory}`,
    ],
    { version: "stable" }
  );
  writeSystemThemeSettings(true);
  await runExtensionHost(vscodeExecutablePath, "auto-mode");
  writeSystemThemeSettings(false);
  await runExtensionHost(vscodeExecutablePath, "manual-themes");
} finally {
  rmSync(vscodeTestStateDirectory, { recursive: true, force: true });
}
