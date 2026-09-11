import assert from "node:assert/strict";
import test from "node:test";
import {
  createThemePreviewArguments,
  createThemePreviewControllerManifest,
  createThemePreviewControllerSource,
  createThemePreviewLaunch,
  createThemePreviewSettings,
} from "../../scripts/open-theme-preview.mjs";

test("creates an editor-first isolated light preview", () => {
  const previewSettings = createThemePreviewSettings("light");
  assert.equal(previewSettings["workbench.colorTheme"], "Everforest Complete Light Medium");
  assert.equal(previewSettings["chat.disableAIFeatures"], true);
  assert.equal(previewSettings["workbench.activityBar.location"], "hidden");
  assert.equal(previewSettings["workbench.statusBar.visible"], false);
  assert.equal(previewSettings["editor.minimap.enabled"], false);
  assert.equal(previewSettings["editor.renderValidationDecorations"], "off");
  assert.equal(previewSettings["workbench.editor.decorations.badges"], false);
  assert.equal(previewSettings["php.validate.enable"], false);
  assert.equal(previewSettings["editor.fontSize"], 18);

  const previewArguments = createThemePreviewArguments("light", "/tmp/theme-preview-state");
  assert.ok(previewArguments.includes("--new-window"));
  assert.ok(previewArguments.includes("--skip-welcome"));
  assert.ok(previewArguments.includes("--disable-workspace-trust"));
  assert.ok(
    previewArguments.includes(
      "--extensionDevelopmentPath=/tmp/theme-preview-state/preview-controller"
    ),
    "preview controller must enforce the requested theme after startup"
  );
  assert.ok(
    previewArguments.some((previewArgument) => previewArgument.endsWith("/fixtures/showcase.tsx"))
  );
  assert.ok(
    previewArguments.some((previewArgument) => previewArgument.endsWith("/fixtures/showcase.scss"))
  );
  assert.equal(
    previewArguments.filter((previewArgument) => previewArgument.includes("/fixtures/")).length,
    12
  );

  assert.deepEqual(createThemePreviewControllerManifest().activationEvents, ["onStartupFinished"]);
  assert.match(createThemePreviewControllerSource("light"), /Everforest Complete Light Medium/);
});

test("supports dark previews and rejects unknown appearances", () => {
  assert.equal(
    createThemePreviewSettings("dark")["workbench.colorTheme"],
    "Everforest Complete Dark Medium"
  );
  assert.match(createThemePreviewControllerSource("dark"), /Everforest Complete Dark Medium/);
  assert.throws(() => createThemePreviewSettings("sepia"), /must be light or dark/);
});

test("uses a foreground macOS app launch or the configured VS Code executable", () => {
  const originalVisualStudioCodeExecutablePath = process.env.VSCODE_EXECUTABLE_PATH;
  try {
    delete process.env.VSCODE_EXECUTABLE_PATH;
    const nativePreviewLaunch = createThemePreviewLaunch("light", "/tmp/theme-preview-state");
    if (process.platform === "darwin") {
      assert.equal(nativePreviewLaunch.command, "open");
      assert.deepEqual(nativePreviewLaunch.arguments.slice(0, 4), [
        "-n",
        "-a",
        "Visual Studio Code",
        "--args",
      ]);
    }

    process.env.VSCODE_EXECUTABLE_PATH = "/custom/code";
    const configuredPreviewLaunch = createThemePreviewLaunch("dark", "/tmp/theme-preview-state");
    assert.equal(configuredPreviewLaunch.command, "/custom/code");
  } finally {
    if (originalVisualStudioCodeExecutablePath === undefined) {
      delete process.env.VSCODE_EXECUTABLE_PATH;
    } else {
      process.env.VSCODE_EXECUTABLE_PATH = originalVisualStudioCodeExecutablePath;
    }
  }
});
