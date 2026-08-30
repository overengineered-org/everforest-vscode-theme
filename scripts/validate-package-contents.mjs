import { execFileSync } from "node:child_process";

const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";
const packagedFiles = execFileSync(
  npxExecutable,
  ["--no-install", "vsce", "ls", "--no-dependencies"],
  { encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .sort();

const expectedPackagedFiles = [
  "CHANGELOG.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "SUPPORT.md",
  "dist/configuration-ui.js",
  "dist/configuration.js",
  "dist/extension-web.js",
  "dist/extension.js",
  "dist/palette/index.js",
  "dist/schedule-controller.js",
  "dist/schedule.js",
  "dist/semantic.js",
  "dist/syntax/default.js",
  "dist/theme.js",
  "dist/theme-regeneration.js",
  "dist/workbench/documented-workbench-colors.json",
  "dist/workbench/colors.js",
  "media/icon.png",
  "media/previews/everforest-complete-customization.webp",
  "media/previews/everforest-complete-light-dark.webp",
  "media/previews/everforest-complete-workbench.webp",
  "media/walkthrough/automate-appearance.svg",
  "media/walkthrough/choose-theme.svg",
  "media/walkthrough/configure-feel.svg",
  "package.json",
  "themes/everforest-complete-dark-color-theme.json",
  "themes/everforest-complete-dark-hard-color-theme.json",
  "themes/everforest-complete-dark-medium-color-theme.json",
  "themes/everforest-complete-dark-soft-color-theme.json",
  "themes/everforest-complete-light-color-theme.json",
  "themes/everforest-complete-light-hard-color-theme.json",
  "themes/everforest-complete-light-medium-color-theme.json",
  "themes/everforest-complete-light-soft-color-theme.json",
].sort();

if (JSON.stringify(packagedFiles) !== JSON.stringify(expectedPackagedFiles)) {
  throw new Error(`Unexpected VSIX contents:\n${packagedFiles.join("\n")}`);
}

console.log(`Validated ${packagedFiles.length} packaged files.`);
