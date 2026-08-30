import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { downloadAndUnzipVSCode, runTests, runVSCodeCommand } from "@vscode/test-electron";

const repositoryDirectory = resolve(import.meta.dirname, "..");
const packagedExtensionDirectory = resolve(repositoryDirectory, "dist");
const packagedExtensionFileNames = existsSync(packagedExtensionDirectory)
  ? readdirSync(packagedExtensionDirectory).filter((fileName) => fileName.endsWith(".vsix"))
  : [];
if (packagedExtensionFileNames.length !== 1) {
  throw new Error(
    `Expected exactly one packaged VSIX in ${packagedExtensionDirectory}, found ${packagedExtensionFileNames.length}`
  );
}
const packagedExtensionPath = resolve(packagedExtensionDirectory, packagedExtensionFileNames[0]);
const vscodeVersion = process.env.EVERFOREST_VSCODE_VERSION ?? "stable";

const temporaryFilesDirectory = process.platform === "darwin" ? "/tmp" : tmpdir();
const vscodeTestStateDirectory = mkdtempSync(resolve(temporaryFilesDirectory, "evf-"));
const isolatedExtensionsDirectory = resolve(vscodeTestStateDirectory, "extensions");
const isolatedUserDataDirectory = resolve(vscodeTestStateDirectory, "user-data");

function writeSystemThemeSettings(autoDetectColorScheme) {
  const userSettingsDirectory = resolve(isolatedUserDataDirectory, "User");
  mkdirSync(userSettingsDirectory, { recursive: true });
  // The Start here flow selects Dark before users enable automatic switching.
  writeFileSync(
    resolve(userSettingsDirectory, "settings.json"),
    `${JSON.stringify(
      {
        "window.autoDetectColorScheme": autoDetectColorScheme,
        "workbench.colorTheme": "Everforest Complete Dark",
        "workbench.preferredDarkColorTheme": "Everforest Complete Dark",
        "workbench.preferredLightColorTheme": "Everforest Complete Light",
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
  const vscodeExecutablePath = await downloadAndUnzipVSCode(vscodeVersion);
  await runVSCodeCommand(
    [
      "--install-extension",
      packagedExtensionPath,
      "--force",
      `--extensions-dir=${isolatedExtensionsDirectory}`,
      `--user-data-dir=${isolatedUserDataDirectory}`,
    ],
    { version: vscodeVersion }
  );
  writeSystemThemeSettings(true);
  await runExtensionHost(vscodeExecutablePath, "auto-mode");
  writeSystemThemeSettings(false);
  await runExtensionHost(vscodeExecutablePath, "manual-themes");
} finally {
  rmSync(vscodeTestStateDirectory, { recursive: true, force: true });
}
