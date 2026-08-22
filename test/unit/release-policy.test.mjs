import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import releaseConfiguration from "../../release.config.cjs";

const silentLogger = { log() {} };
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
  return analyzeCommits(
    { preset: "conventionalcommits" },
    {
      commits: [{ message: commitMessage }],
      logger: silentLogger,
    }
  );
}

test("releases only eligible conventional commits", async () => {
  assert.equal(await releaseTypeFor("fix: correct terminal contrast"), "patch");
  assert.equal(await releaseTypeFor("feat: add another variant"), "minor");
  assert.equal(await releaseTypeFor("feat!: rename every theme"), "major");
  assert.equal(await releaseTypeFor("docs: clarify installation"), null);
  assert.equal(await releaseTypeFor("chore: refresh fixtures"), null);
});

test("publishes only from main with a versioned tag", () => {
  assert.deepEqual(releaseConfiguration.branches, ["main"]);
  assert.equal(releaseConfiguration.tagFormat, "v${version}");
});

test("publishes the VSIX and checksum to GitHub without issue permissions", () => {
  const [, releaseNotesConfiguration] = releaseConfiguration.plugins.find(
    ([pluginName]) => pluginName === "@semantic-release/release-notes-generator"
  );
  const [, githubPluginConfiguration] = releaseConfiguration.plugins.find(
    ([pluginName]) => pluginName === "@semantic-release/github"
  );

  assert.deepEqual(releaseNotesConfiguration, { preset: "conventionalcommits" });
  assert.deepEqual(
    githubPluginConfiguration.assets.map(({ path }) => path),
    ["dist/everforest-complete-*.vsix", "dist/everforest-complete-*.vsix.sha256"]
  );
  assert.equal(githubPluginConfiguration.failComment, false);
  assert.equal(githubPluginConfiguration.failTitle, false);
  assert.equal(githubPluginConfiguration.releasedLabels, false);
  assert.equal(githubPluginConfiguration.successComment, false);
});

test("prepares Marketplace distribution without adding a stored publishing credential", () => {
  const continuousIntegrationWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/ci.yml"),
    "utf8"
  );
  const releaseRecoveryWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/github-release-recovery.yml"),
    "utf8"
  );
  const readme = readFileSync(resolve(repositoryDirectory, "README.md"), "utf8");
  const extensionManifest = JSON.parse(
    readFileSync(resolve(repositoryDirectory, "package.json"), "utf8")
  );
  const releaseJob = workflowJobBlock(continuousIntegrationWorkflow, "release");
  const recoveryPublishJob = workflowJobBlock(releaseRecoveryWorkflow, "publish");
  const releaseSources = `${continuousIntegrationWorkflow}\n${releaseRecoveryWorkflow}`;

  for (const prohibitedReleaseTerm of [
    "azure/login",
    "marketplace-production",
    "vsce publish",
    "VSCE_PAT",
  ]) {
    assert.equal(releaseSources.toLowerCase().includes(prohibitedReleaseTerm.toLowerCase()), false);
  }
  assert.doesNotMatch(continuousIntegrationWorkflow, /secrets\./);
  assert.ok(releaseJob.includes("GITHUB_TOKEN: ${{ github.token }}"));
  assert.ok(releaseJob.includes("- static"));
  assert.ok(releaseJob.includes("- tests-summary"));
  assert.ok(releaseJob.includes("contents: write"));
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

test("evaluates the pull request against an isolated main remote", () => {
  const continuousIntegrationWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/ci.yml"),
    "utf8"
  );
  const releaseDryRunJob = workflowJobBlock(continuousIntegrationWorkflow, "release-dry-run");

  assert.ok(releaseDryRunJob.includes("git switch --force-create main"));
  assert.ok(
    releaseDryRunJob.includes('release_dry_run_repository="$RUNNER_TEMP/release-dry-run.git"')
  );
  assert.ok(releaseDryRunJob.includes("git init --bare --initial-branch=main"));
  assert.ok(releaseDryRunJob.includes('git push "$release_dry_run_repository" HEAD:main --tags'));
  assert.ok(releaseDryRunJob.includes("GITHUB_EVENT_NAME=push"));
  assert.ok(releaseDryRunJob.includes("GITHUB_REF=refs/heads/main"));
  assert.ok(releaseDryRunJob.includes("npm run release -- --dry-run --no-ci"));
  assert.ok(releaseDryRunJob.includes('--repository-url "file://$release_dry_run_repository"'));
  assert.ok(releaseDryRunJob.includes("--plugins @semantic-release/commit-analyzer"));
  assert.ok(releaseDryRunJob.includes("--plugins @semantic-release/release-notes-generator"));
  assert.equal(releaseDryRunJob.includes("@semantic-release/github"), false);
  assert.equal(releaseDryRunJob.includes("GITHUB_TOKEN"), false);
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
