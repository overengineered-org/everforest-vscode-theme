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
  "media/icon.png",
  "package.json",
  "themes/everforest-complete-dark-hard-color-theme.json",
  "themes/everforest-complete-dark-medium-color-theme.json",
  "themes/everforest-complete-dark-soft-color-theme.json",
  "themes/everforest-complete-light-hard-color-theme.json",
  "themes/everforest-complete-light-medium-color-theme.json",
  "themes/everforest-complete-light-soft-color-theme.json",
].sort();

if (JSON.stringify(packagedFiles) !== JSON.stringify(expectedPackagedFiles)) {
  throw new Error(`Unexpected VSIX contents:\n${packagedFiles.join("\n")}`);
}

console.log(`Validated ${packagedFiles.length} packaged files.`);
