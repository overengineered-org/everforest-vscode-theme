import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { Bumper } from "conventional-recommended-bump";
import releaseConfiguration from "../../.release-it.cjs";

const repositoryDirectory = resolve(import.meta.dirname, "../..");

function workflowJobBlock(workflowSource, jobName) {
  const workflowLines = workflowSource.split("\n");
  const jobLineIndex = workflowLines.indexOf(`  ${jobName}:`);
  assert.notEqual(jobLineIndex, -1, `Workflow defines the ${jobName} job`);

  const nextJobLineIndex = workflowLines.findIndex(
    (workflowLine, lineIndex) =>
      lineIndex > jobLineIndex &&
      workflowLine.startsWith("  ") &&
      !workflowLine.startsWith("   ") &&
      workflowLine.endsWith(":")
  );
  return workflowLines
    .slice(jobLineIndex, nextJobLineIndex === -1 ? undefined : nextJobLineIndex)
    .join("\n");
}

async function releaseTypeFor(commitMessage) {
  const commitType = /^([a-z]+)(?:\([^)]*\))?!?:/.exec(commitMessage)?.[1];
  const recommendation = await new Bumper()
    .loadPreset("conventionalcommits")
    .commits([{ header: commitMessage, notes: [], type: commitType }])
    .bump();
  return recommendation.releaseType;
}

test("releases only eligible conventional commits", async () => {
  assert.equal(await releaseTypeFor("fix: correct terminal contrast"), "patch");
  assert.equal(await releaseTypeFor("feat: add another variant"), "minor");
  assert.equal(await releaseTypeFor("feat!: rename every theme"), "major");
  assert.equal(await releaseTypeFor("docs: clarify installation"), undefined);
  assert.equal(await releaseTypeFor("chore: refresh fixtures"), undefined);
});

test("publishes only from main with a versioned tag and no release commit", () => {
  assert.equal(releaseConfiguration.git.requireBranch, "main");
  assert.equal(releaseConfiguration.git.tagName, "v${version}");
  assert.equal(releaseConfiguration.git.commit, false);
  assert.equal(releaseConfiguration.npm, false);
  const extensionManifest = JSON.parse(
    readFileSync(resolve(repositoryDirectory, "package.json"), "utf8")
  );
  assert.equal(extensionManifest.scripts.release, "release-it --ci");
});

test("publishes the versioned VSIX and checksum with conventional release notes", () => {
  assert.deepEqual(releaseConfiguration.github.assets, [
    "dist/everforest-complete-*.vsix",
    "dist/everforest-complete-*.vsix.sha256",
  ]);
  assert.equal(releaseConfiguration.github.release, true);
  assert.equal(releaseConfiguration.github.releaseName, "v${version}");
  assert.equal(
    releaseConfiguration.hooks["before:git:release"],
    "node scripts/package-release.mjs ${version}"
  );
  assert.deepEqual(releaseConfiguration.plugins["@release-it/conventional-changelog"], {
    infile: false,
    preset: { name: "conventionalcommits" },
  });
});

test("publishes the exact GitHub release with the protected Marketplace PAT", () => {
  const continuousIntegrationWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/ci.yml"),
    "utf8"
  );
  const releaseRecoveryWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/github-release-recovery.yml"),
    "utf8"
  );
  const architecture = readFileSync(resolve(repositoryDirectory, "docs/ARCHITECTURE.md"), "utf8");
  const readme = readFileSync(resolve(repositoryDirectory, "README.md"), "utf8");
  const extensionManifest = JSON.parse(
    readFileSync(resolve(repositoryDirectory, "package.json"), "utf8")
  );
  const releaseJob = workflowJobBlock(continuousIntegrationWorkflow, "release");
  const marketplaceJob = workflowJobBlock(continuousIntegrationWorkflow, "marketplace");
  const recoveryPublishJob = workflowJobBlock(releaseRecoveryWorkflow, "publish");
  const releaseSources = `${continuousIntegrationWorkflow}\n${releaseRecoveryWorkflow}`;

  assert.doesNotMatch(releaseSources, /(?:^|\s)--pat(?:\s|$)/im);
  assert.doesNotMatch(
    releaseSources,
    /(?:azure\/login@|AZURE_|--azure-credential|--oidc|bootstrap-marketplace-identity|marketplace-identity-profile|marketplace-profile-public|marketplace-profile-id\.enc|MARKETPLACE_PROFILE_PUBLIC_KEY_BASE64)/i
  );
  assert.ok(releaseJob.includes("GITHUB_TOKEN: ${{ github.token }}"));
  assert.ok(releaseJob.includes("- static"));
  assert.ok(releaseJob.includes("- tests-summary"));
  assert.ok(releaseJob.includes("contents: write"));
  assert.ok(releaseJob.includes("release-tag: ${{ steps.resolve-release.outputs.tag }}"));
  assert.ok(releaseJob.includes("git tag --points-at HEAD"));
  assert.ok(marketplaceJob.includes("needs: release"));
  assert.ok(marketplaceJob.includes("environment: marketplace-production"));
  assert.ok(marketplaceJob.includes("contents: read"));
  assert.ok(marketplaceJob.includes("VSCE_PAT: ${{ secrets.VSCE_PAT }}"));
  assert.ok(marketplaceJob.includes("RELEASE_TAG: ${{ needs.release.outputs.release-tag }}"));
  assert.ok(marketplaceJob.includes("gh release download"));
  assert.ok(marketplaceJob.includes("sha256sum --check"));
  assert.ok(marketplaceJob.includes("npx --no-install vsce publish"));
  assert.ok(
    marketplaceJob.includes(
      'npx --no-install vsce publish --packagePath "$RELEASE_PACKAGE_PATH" --skip-duplicate'
    )
  );
  assert.ok(marketplaceJob.includes("--packagePath"));
  assert.ok(marketplaceJob.includes("--skip-duplicate"));
  assert.match(architecture, /protected\s+`VSCE_PAT`\s+secret/);
  assert.doesNotMatch(architecture, /Microsoft Entra ID|Entra ID/);
  assert.match(readme, /protected\s+`VSCE_PAT`\s+secret/);
  assert.doesNotMatch(readme, /Microsoft Entra ID|Entra ID/);
  assert.ok(recoveryPublishJob.includes("GH_REPO: ${{ github.repository }}"));
  assert.match(releaseRecoveryWorkflow, /group: production-release/);
  assert.ok(recoveryPublishJob.includes("release_is_draft"));
  assert.ok(recoveryPublishJob.includes("Release $RELEASE_TAG is immutable"));
  assert.deepEqual(extensionManifest.categories, ["Themes"]);
  assert.deepEqual(extensionManifest.galleryBanner, { color: "#2D353B", theme: "dark" });
  assert.equal(extensionManifest.pricing, "Free");
  assert.match(readme, /overengineered-org\.everforest-complete/);
  assert.match(readme, /Marketplace installations receive updates through VS Code/);
  assert.match(readme, /Install from VSIX/);
  assert.match(readme, /releases\/latest/);
  assert.ok(readme.includes("This creates `dist/everforest-complete.vsix`"));
  assert.ok(readme.includes("npm run package:vsix"));
  assert.equal(
    existsSync(resolve(repositoryDirectory, ".github/workflows/marketplace-recovery.yml")),
    false
  );
  assert.equal(existsSync(resolve(repositoryDirectory, "docs/MARKETPLACE_PUBLISHING.md")), false);
});

test("reuses one validated VSIX across every integration matrix job", () => {
  const continuousIntegrationWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/ci.yml"),
    "utf8"
  );
  const extensionManifest = JSON.parse(
    readFileSync(resolve(repositoryDirectory, "package.json"), "utf8")
  );
  const staticJob = workflowJobBlock(continuousIntegrationWorkflow, "static");
  const integrationJob = workflowJobBlock(continuousIntegrationWorkflow, "integration");

  assert.ok(staticJob.includes("actions/upload-artifact@"));
  assert.ok(staticJob.includes("name: validated-vsix"));
  assert.ok(staticJob.includes("path: dist/everforest-complete.vsix"));
  assert.ok(
    staticJob.indexOf("Upload validated VSIX") <
      staticJob.indexOf("Verify release package and checksum"),
    "validated VSIX must be uploaded before release-package testing cleans dist"
  );
  assert.ok(integrationJob.includes("needs: static"));
  assert.ok(integrationJob.includes("actions/download-artifact@"));
  assert.ok(integrationJob.includes("name: validated-vsix"));
  assert.ok(integrationJob.includes("path: dist"));
  assert.ok(integrationJob.includes("npm run test:integration:vsix"));
  assert.equal(integrationJob.includes("npm run package:vsix"), false);
  assert.equal(integrationJob.includes("npm run test:integration\n"), false);
  assert.equal(
    extensionManifest.scripts["test:integration:vsix"],
    "node scripts/run-integration-tests.mjs"
  );
});

test("installs lean dependencies only after the VSIX is built", () => {
  const continuousIntegrationWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/ci.yml"),
    "utf8"
  );
  const releaseRecoveryWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/github-release-recovery.yml"),
    "utf8"
  );
  const leanIntegrationInstallCommand =
    "run: npm ci --ignore-scripts --omit=optional --no-audit --no-fund";
  const staticJob = workflowJobBlock(continuousIntegrationWorkflow, "static");
  const integrationJob = workflowJobBlock(continuousIntegrationWorkflow, "integration");
  const releaseDryRunJob = workflowJobBlock(continuousIntegrationWorkflow, "release-dry-run");
  const releaseJob = workflowJobBlock(continuousIntegrationWorkflow, "release");
  const marketplaceJob = workflowJobBlock(continuousIntegrationWorkflow, "marketplace");
  const recoveryBuildJob = workflowJobBlock(releaseRecoveryWorkflow, "build");

  assert.ok(integrationJob.includes(leanIntegrationInstallCommand));
  assert.equal(
    continuousIntegrationWorkflow.split(leanIntegrationInstallCommand).length - 1,
    1,
    "only the integration matrix may omit build and release dependencies"
  );
  for (const packagingOrReleaseJob of [
    staticJob,
    releaseDryRunJob,
    releaseJob,
    marketplaceJob,
    recoveryBuildJob,
  ]) {
    assert.match(packagingOrReleaseJob, /^\s+run: npm ci$/m);
    assert.equal(packagingOrReleaseJob.includes(leanIntegrationInstallCommand), false);
  }
});

test("compiles once during static validation", () => {
  const extensionManifest = JSON.parse(
    readFileSync(resolve(repositoryDirectory, "package.json"), "utf8")
  );
  const extensionScripts = extensionManifest.scripts;
  const staticValidationSteps = extensionScripts["verify:static"].split(" && ");

  assert.equal(extensionScripts["test:unit"], "npm run compile && npm run test:unit:compiled");
  assert.equal(
    extensionScripts["test:performance"],
    "npm run compile && npm run test:performance:compiled"
  );
  assert.ok(extensionScripts["test:unit:compiled"].includes("node --test"));
  assert.equal(
    extensionScripts["test:performance:compiled"],
    "node --test test/performance/*.test.mjs"
  );
  assert.deepEqual(staticValidationSteps.slice(0, 4), [
    "npm run clean",
    "npm run compile",
    "npm run test:unit:compiled",
    "npm run test:performance:compiled",
  ]);
  assert.equal(
    staticValidationSteps.filter((validationStep) => validationStep === "npm run compile").length,
    1
  );
  assert.match(extensionManifest.devDependencies["@types/node"], /^\^24\.\d+\.\d+$/);
  assert.equal(extensionScripts["vscode:prepublish"], "npm run verify:static");
});

test("fails the test aggregate unless integration passes", () => {
  const continuousIntegrationWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/ci.yml"),
    "utf8"
  );
  const testsSummaryJob = workflowJobBlock(continuousIntegrationWorkflow, "tests-summary");

  assert.ok(testsSummaryJob.includes("if: always()"));
  assert.ok(testsSummaryJob.includes("- integration"));
  assert.ok(testsSummaryJob.includes("INTEGRATION_RESULT: ${{ needs.integration.result }}"));
  assert.ok(testsSummaryJob.includes('if [[ "$INTEGRATION_RESULT" != success ]]'));
});

test("evaluates the pull request as main without publishing", () => {
  const continuousIntegrationWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/ci.yml"),
    "utf8"
  );
  const releaseDryRunJob = workflowJobBlock(continuousIntegrationWorkflow, "release-dry-run");
  const releaseJob = workflowJobBlock(continuousIntegrationWorkflow, "release");

  assert.ok(releaseDryRunJob.includes("git switch --force-create main"));
  assert.ok(releaseDryRunJob.includes("git branch --set-upstream-to=origin/main main"));
  assert.ok(releaseDryRunJob.includes("npm run release -- --dry-run"));
  assert.ok(releaseDryRunJob.includes("--no-git.push"));
  assert.ok(releaseDryRunJob.includes("--no-github.release"));
  assert.equal(releaseDryRunJob.includes("GITHUB_TOKEN"), false);
  assert.ok(releaseJob.includes("git switch --force-create main"));
  assert.ok(releaseJob.includes("git branch --set-upstream-to=origin/main main"));
  assert.ok(releaseJob.includes("persist-credentials: true"));
  assert.ok(releaseJob.includes('git config user.name "Repository Maintainer"'));
  assert.ok(
    releaseJob.includes('git config user.email "repository-maintainer@overengineered.invalid"')
  );
});

test("runs the required Linux 1.95.3 compatibility gate before release", () => {
  const continuousIntegrationWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/ci.yml"),
    "utf8"
  );
  const integrationJob = workflowJobBlock(continuousIntegrationWorkflow, "integration");

  assert.ok(integrationJob.includes("operating-system: ubuntu-latest"));
  assert.ok(integrationJob.includes("vscode-version: 1.95.3"));
  assert.ok(integrationJob.includes("EVERFOREST_VSCODE_VERSION: ${{ matrix.vscode-version }}"));
});
