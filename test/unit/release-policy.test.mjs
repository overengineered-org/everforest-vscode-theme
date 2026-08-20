import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import releaseConfiguration from "../../release.config.cjs";

const silentLogger = { log() {} };
const repositoryDirectory = resolve(import.meta.dirname, "../..");

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
  const [, githubPluginConfiguration] = releaseConfiguration.plugins.find(
    ([pluginName]) => pluginName === "@semantic-release/github"
  );

  assert.deepEqual(
    githubPluginConfiguration.assets.map(({ path }) => path),
    ["dist/everforest-complete-*.vsix", "dist/everforest-complete-*.vsix.sha256"]
  );
  assert.equal(githubPluginConfiguration.failComment, false);
  assert.equal(githubPluginConfiguration.failTitle, false);
  assert.equal(githubPluginConfiguration.releasedLabels, false);
  assert.equal(githubPluginConfiguration.successComment, false);
});

test("keeps distribution GitHub-only", () => {
  const continuousIntegrationWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/ci.yml"),
    "utf8"
  );
  const releaseRecoveryWorkflow = readFileSync(
    resolve(repositoryDirectory, ".github/workflows/github-release-recovery.yml"),
    "utf8"
  );
  const readme = readFileSync(resolve(repositoryDirectory, "README.md"), "utf8");

  assert.doesNotMatch(
    `${continuousIntegrationWorkflow}\n${releaseRecoveryWorkflow}`,
    /azure\/login|entra|marketplace-production|vsce publish|VSCE_PAT/i
  );
  assert.doesNotMatch(continuousIntegrationWorkflow, /secrets\./);
  assert.match(continuousIntegrationWorkflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(
    continuousIntegrationWorkflow,
    /needs:\n\s+- static\n\s+- integration\n\s+- web-integration/
  );
  assert.match(continuousIntegrationWorkflow, /permissions:\n\s+contents: write/);
  assert.match(releaseRecoveryWorkflow, /GH_REPO: \$\{\{ github\.repository \}\}/);
  assert.match(releaseRecoveryWorkflow, /group: production-release/);
  assert.doesNotMatch(releaseRecoveryWorkflow, /--clobber/);
  assert.match(readme, /Install from VSIX/);
  assert.match(readme, /releases\/latest/);
  assert.equal(
    existsSync(resolve(repositoryDirectory, ".github/workflows/marketplace-recovery.yml")),
    false
  );
  assert.equal(existsSync(resolve(repositoryDirectory, "docs/MARKETPLACE_PUBLISHING.md")), false);
});
