import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { Bumper } from "conventional-recommended-bump";
import releaseConfiguration from "../../.release-it.cjs";

const repositoryDirectory = resolve(import.meta.dirname, "../..");

function repositoryFile(relativePath) {
  return readFileSync(resolve(repositoryDirectory, relativePath), "utf8");
}

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
  const extensionManifest = JSON.parse(repositoryFile("package.json"));
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
    "node scripts/verify-release-package.mjs ${version}"
  );
});

test("keeps automatic validation local and GitHub workflows release-only", () => {
  const releaseWorkflow = repositoryFile(".github/workflows/release.yml");
  const recoveryWorkflow = repositoryFile(".github/workflows/github-release-recovery.yml");
  const localActWorkflow = repositoryFile(".act/workflows/verify.yml");

  for (const githubReleaseWorkflow of [releaseWorkflow, recoveryWorkflow]) {
    assert.match(githubReleaseWorkflow, /^on:\n  workflow_dispatch:/m);
    assert.doesNotMatch(githubReleaseWorkflow, /^  (?:pull_request|push|schedule):/m);
  }
  assert.match(localActWorkflow, /^on:\n  workflow_dispatch:/m);
  assert.equal(existsSync(resolve(repositoryDirectory, ".github/workflows/ci.yml")), false);
});

test("pins and reuses one ACT runner while pruning only dangling images", () => {
  const actConfiguration = repositoryFile(".actrc");
  const localValidationScript = repositoryFile("scripts/verify-local.sh");

  assert.match(
    actConfiguration,
    /--platform=ubuntu-latest=ghcr\.io\/catthehacker\/ubuntu:act-24\.04@sha256:[0-9a-f]{64}/
  );
  assert.match(actConfiguration, /^--container-architecture=linux\/amd64$/m);
  assert.match(actConfiguration, /^--bind$/m);
  assert.match(actConfiguration, /^--reuse$/m);
  assert.match(actConfiguration, /^--pull=false$/m);
  assert.match(actConfiguration, /everforest-codeql-cache:\/opt\/codeql-cache/);
  assert.ok(localValidationScript.includes('docker image inspect "$pinned_act_runner_image"'));
  assert.ok(localValidationScript.includes('docker pull "$pinned_act_runner_image"'));
  assert.ok(localValidationScript.includes("docker image prune --force"));
  assert.equal(localValidationScript.includes("docker container prune"), false);
  assert.equal(localValidationScript.includes("docker image prune --all"), false);
});

test("runs Linux, CodeQL, macOS, secrets, and release policy before status reporting", () => {
  const localActWorkflow = repositoryFile(".act/workflows/verify.yml");
  const localValidationScript = repositoryFile("scripts/verify-local.sh");
  const statusReportingIndex = localValidationScript.indexOf(
    'gh api --method POST "repos/${repository_slug}/statuses/${validated_commit_sha}"'
  );

  assert.ok(localActWorkflow.includes("npm run package:vsix"));
  assert.ok(localActWorkflow.includes('EVERFOREST_EMULATED_RUNNER: "1"'));
  assert.equal(localActWorkflow.includes("npm run verify:static"), false);
  assert.ok(localActWorkflow.includes("required_vscode_package_names=("));
  assert.ok(localActWorkflow.includes("libnspr4"));
  assert.ok(localActWorkflow.includes("libgtk-3-0t64"));
  assert.ok(localActWorkflow.includes("xvfb"));
  assert.ok(localActWorkflow.includes("xvfb-run --auto-servernum npm run test:integration:vsix"));
  assert.ok(localActWorkflow.includes("EVERFOREST_VSCODE_VERSION: 1.95.3"));
  assert.ok(localActWorkflow.includes("npm run audit:production"));
  assert.ok(localActWorkflow.includes("npm audit"));
  assert.ok(localActWorkflow.includes("scripts/install-codeql.sh"));
  assert.ok(localActWorkflow.includes("scripts/run-codeql-analysis.sh"));
  assert.ok(localValidationScript.includes("npm run test:integration:vsix"));
  assert.ok(localValidationScript.includes(".codex/environments/secret-scan.sh"));
  assert.ok(localValidationScript.includes("--no-git.requireBranch"));
  assert.ok(localValidationScript.includes("--no-git.requireCleanWorkingDir"));
  assert.ok(localValidationScript.includes("scripts/validate-pull-request-title.mjs"));
  assert.ok(statusReportingIndex > localValidationScript.indexOf("act workflow_dispatch"));
  assert.ok(statusReportingIndex > localValidationScript.indexOf("npm run test:integration:vsix"));
  assert.ok(statusReportingIndex > localValidationScript.indexOf("secret-scan.sh"));
  assert.ok(localValidationScript.includes('context="$local_validation_context"'));
});

test("uses the same pinned CodeQL scan locally and before release", () => {
  const localActWorkflow = repositoryFile(".act/workflows/verify.yml");
  const releaseWorkflow = repositoryFile(".github/workflows/release.yml");
  const codeqlInstaller = repositoryFile("scripts/install-codeql.sh");
  const codeqlAnalysis = repositoryFile("scripts/run-codeql-analysis.sh");

  for (const codeqlConsumer of [localActWorkflow, releaseWorkflow]) {
    assert.ok(codeqlConsumer.includes("scripts/install-codeql.sh"));
    assert.ok(codeqlConsumer.includes("scripts/run-codeql-analysis.sh"));
  }
  assert.ok(codeqlInstaller.includes('readonly codeql_bundle_version="2.26.4"'));
  assert.ok(codeqlInstaller.includes("sha256sum --check"));
  assert.ok(codeqlAnalysis.includes("for codeql_language in actions javascript-typescript"));
  assert.ok(codeqlAnalysis.includes("scripts/assert-codeql-results.mjs"));
  assert.match(releaseWorkflow, /github\/codeql-action\/upload-sarif@[0-9a-f]{40}/);
});

test("releases only the requested exact current main commit", () => {
  const releaseWorkflow = repositoryFile(".github/workflows/release.yml");
  const buildJob = workflowJobBlock(releaseWorkflow, "build");
  const releaseJob = workflowJobBlock(releaseWorkflow, "release");

  assert.ok(releaseWorkflow.includes("commit_sha:"));
  assert.ok(releaseWorkflow.includes("release_increment:"));
  assert.ok(releaseWorkflow.includes("type: choice"));
  assert.ok(releaseWorkflow.includes("- patch"));
  assert.ok(releaseWorkflow.includes("- minor"));
  assert.ok(releaseWorkflow.includes("- major"));
  assert.ok(buildJob.includes('[[ ! "$RELEASE_COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]'));
  assert.ok(buildJob.includes("git fetch --no-tags origin main"));
  assert.ok(buildJob.includes("git rev-parse origin/main"));
  assert.ok(buildJob.includes('git switch --force-create main "$checked_out_commit_sha"'));
  assert.ok(releaseWorkflow.includes("release-commit:"));
  assert.equal(releaseWorkflow.includes("ref: ${{ inputs.commit_sha }}"), false);
  assert.equal(releaseWorkflow.match(/ref: main/g)?.length, 5);
  assert.ok(releaseWorkflow.includes("Require unchanged release commit"));
  assert.ok(
    buildJob.includes(
      'release-it "$RELEASE_INCREMENT" --release-version --no-git.push --no-github.release'
    )
  );
  assert.ok(releaseJob.includes('npm run release -- "$RELEASE_VERSION"'));
  assert.ok(releaseJob.includes("- codeql"));
  assert.ok(releaseJob.includes("- integration"));
});

test("reuses one exact candidate across every release platform and publication", () => {
  const releaseWorkflow = repositoryFile(".github/workflows/release.yml");
  const buildJob = workflowJobBlock(releaseWorkflow, "build");
  const integrationJob = workflowJobBlock(releaseWorkflow, "integration");
  const releaseJob = workflowJobBlock(releaseWorkflow, "release");
  const marketplaceJob = workflowJobBlock(releaseWorkflow, "marketplace");

  assert.ok(buildJob.includes("node scripts/package-release.mjs"));
  assert.ok(buildJob.includes("node scripts/verify-release-package.mjs"));
  assert.ok(buildJob.includes("name: validated-vsix"));
  assert.ok(integrationJob.includes("actions/download-artifact@"));
  assert.ok(integrationJob.includes("name: validated-vsix"));
  assert.equal(integrationJob.includes("npm run package:vsix"), false);
  assert.ok(integrationJob.includes("operating-system: windows-latest"));
  assert.ok(integrationJob.includes("operating-system: macos-latest"));
  assert.ok(integrationJob.includes("vscode-version: 1.95.3"));
  assert.ok(releaseJob.includes("Download exact tested release package"));
  assert.equal(releaseJob.includes("npm run package:vsix"), false);
  assert.ok(marketplaceJob.includes("gh release download"));
  assert.ok(marketplaceJob.includes("sha256sum --check"));
  assert.ok(marketplaceJob.includes("VSCE_PAT: ${{ secrets.VSCE_PAT }}"));
  assert.ok(marketplaceJob.includes("--packagePath"));
  assert.ok(marketplaceJob.includes("--skip-duplicate"));
});

test("keeps release recovery manual and cross-platform", () => {
  const recoveryWorkflow = repositoryFile(".github/workflows/github-release-recovery.yml");
  const recoveryIntegrationJob = workflowJobBlock(recoveryWorkflow, "integration");
  const recoveryPublishJob = workflowJobBlock(recoveryWorkflow, "publish");

  assert.ok(recoveryIntegrationJob.includes("operating-system: windows-latest"));
  assert.ok(recoveryIntegrationJob.includes("operating-system: macos-latest"));
  assert.ok(recoveryIntegrationJob.includes("vscode-version: 1.95.3"));
  assert.ok(recoveryIntegrationJob.includes("name: recovered-release-assets"));
  assert.ok(recoveryPublishJob.includes("release_is_draft"));
  assert.ok(recoveryPublishJob.includes("Release $RELEASE_TAG is immutable"));
});

test("compiles once during static validation", () => {
  const extensionManifest = JSON.parse(repositoryFile("package.json"));
  const extensionScripts = extensionManifest.scripts;
  const staticValidationSteps = extensionScripts["verify:static"].split(" && ");

  assert.equal(extensionScripts["test:unit"], "npm run compile && npm run test:unit:compiled");
  assert.equal(
    extensionScripts["test:performance"],
    "npm run compile && npm run test:performance:compiled"
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
  assert.equal(extensionScripts["vscode:prepublish"], "npm run verify:static");
});

test("keeps the Codex full-validation entrypoint on the one local gate", () => {
  const fullValidationWorkflow = repositoryFile(".codex/environments/full-validation.sh");
  const releasePackagingScript = repositoryFile("scripts/package-release.mjs");

  assert.equal(fullValidationWorkflow.split("scripts/verify-local.sh").length - 1, 1);
  assert.equal(fullValidationWorkflow.includes("npm test"), false);
  assert.equal(releasePackagingScript.includes("vsce"), false);
  assert.equal(releasePackagingScript.includes("spawnSync"), false);
});
