import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { Bumper } from "conventional-recommended-bump";
import { load as parseYaml } from "js-yaml";
import releaseConfiguration from "../../.release-it.cjs";

const repositoryDirectory = resolve(import.meta.dirname, "../..");

function repositoryFile(relativePath) {
  return readFileSync(resolve(repositoryDirectory, relativePath), "utf8");
}

function workflowDocument(relativePath) {
  return parseYaml(repositoryFile(relativePath));
}

function workflowStep(workflowDocumentValue, jobName, stepName) {
  const workflowJob = workflowDocumentValue.jobs[jobName];
  assert.ok(workflowJob, `Workflow defines the ${jobName} job`);
  const workflowStepValue = workflowJob.steps.find((step) => step.name === stepName);
  assert.ok(workflowStepValue, `${jobName} defines the ${stepName} step`);
  return workflowStepValue;
}

function workflowStepIndex(workflowDocumentValue, jobName, stepName) {
  const workflowJob = workflowDocumentValue.jobs[jobName];
  assert.ok(workflowJob, `Workflow defines the ${jobName} job`);
  const stepIndex = workflowJob.steps.findIndex((step) => step.name === stepName);
  assert.notEqual(stepIndex, -1, `${jobName} defines the ${stepName} step`);
  return stepIndex;
}

function marketplaceWorkflowSecretReferenceCount(workflowDocumentValue) {
  return Object.values(workflowDocumentValue.jobs)
    .flatMap((workflowJob) => workflowJob.steps ?? [])
    .flatMap((workflowStepValue) => Object.values(workflowStepValue.env ?? {}))
    .filter((environmentValue) => environmentValue === "${{ secrets.VSCE_PAT }}").length;
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
  const marketplaceRecoveryWorkflow = repositoryFile(".github/workflows/marketplace-recovery.yml");
  const localActWorkflow = repositoryFile(".act/workflows/verify.yml");

  for (const githubReleaseWorkflow of [
    releaseWorkflow,
    recoveryWorkflow,
    marketplaceRecoveryWorkflow,
  ]) {
    assert.match(githubReleaseWorkflow, /^on:\n  workflow_dispatch:/m);
    assert.doesNotMatch(githubReleaseWorkflow, /^  (?:pull_request|push|schedule):/m);
  }
  assert.match(localActWorkflow, /^on:\n  workflow_dispatch:/m);
  assert.equal(existsSync(resolve(repositoryDirectory, ".github/workflows/ci.yml")), false);
});

test("pins the ACT runner without broad cleanup", () => {
  const actConfiguration = repositoryFile(".actrc");
  const localValidationScript = repositoryFile("scripts/verify-local.sh");

  assert.match(
    actConfiguration,
    /--platform=ubuntu-latest=ghcr\.io\/catthehacker\/ubuntu:act-24\.04@sha256:[0-9a-f]{64}/
  );
  assert.match(actConfiguration, /^--container-architecture=linux\/amd64$/m);
  assert.match(actConfiguration, /^--bind$/m);
  assert.match(actConfiguration, /^--rm$/m);
  assert.doesNotMatch(actConfiguration, /^--reuse$/m);
  assert.match(actConfiguration, /^--pull=false$/m);
  assert.match(actConfiguration, /everforest-codeql-cache:\/opt\/codeql-cache/);
  assert.ok(localValidationScript.includes('docker image inspect "$pinned_act_runner_image"'));
  assert.ok(localValidationScript.includes('docker pull "$pinned_act_runner_image"'));
  assert.equal(localValidationScript.includes("docker image prune"), false);
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
  assert.ok(
    codeqlInstaller.includes(
      'readonly codeql_bundle_sha256="48e1ab8b874d57bd6fd7c90fefee75addc5a45e9bd063982df9beb45a62dd5d3"'
    )
  );
  assert.ok(codeqlInstaller.includes("sha256sum --check"));
  assert.equal(codeqlInstaller.includes(".checksum.txt"), false);
  assert.ok(codeqlAnalysis.includes("for codeql_language in actions javascript-typescript"));
  assert.ok(codeqlAnalysis.includes('--sarif-category="everforest/${codeql_language}"'));
  assert.ok(codeqlAnalysis.includes("scripts/assert-codeql-results.mjs"));
  assert.equal(
    workflowStep(
      workflowDocument(".github/workflows/release.yml"),
      "codeql",
      "Upload CodeQL results"
    ).uses,
    "github/codeql-action/upload-sarif@cdf488f595d80d6e07e03d4674febd5ab45fa938"
  );
  assert.match(releaseWorkflow, /gitleaks\/gitleaks-action@[0-9a-f]{40}/);
});

test("releases only the requested exact current main commit", () => {
  const releaseWorkflow = repositoryFile(".github/workflows/release.yml");
  const releaseWorkflowDocument = workflowDocument(".github/workflows/release.yml");
  const buildJob = workflowJobBlock(releaseWorkflow, "build");
  const releaseJob = workflowJobBlock(releaseWorkflow, "release");

  assert.deepEqual(Object.keys(releaseWorkflowDocument.on.workflow_dispatch.inputs), [
    "commit_sha",
    "release_increment",
  ]);
  assert.equal(releaseWorkflowDocument.jobs.release.permissions.contents, "write");
  assert.equal(
    workflowStep(releaseWorkflowDocument, "release", "Check out main").with["persist-credentials"],
    false
  );
  assert.equal(
    workflowStep(releaseWorkflowDocument, "gitleaks", "Scan release commit for secrets").uses,
    "gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e"
  );
  assert.ok(releaseWorkflow.includes("commit_sha:"));
  assert.ok(releaseWorkflow.includes("release_increment:"));
  assert.ok(releaseWorkflow.includes("type: choice"));
  assert.ok(releaseWorkflow.includes("- patch"));
  assert.ok(releaseWorkflow.includes("- minor"));
  assert.ok(releaseWorkflow.includes("- major"));
  assert.ok(buildJob.includes('[[ ! "$RELEASE_COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]'));
  assert.ok(buildJob.includes("git fetch --tags --force origin main:refs/remotes/origin/main"));
  assert.ok(buildJob.includes("git rev-parse origin/main"));
  assert.ok(buildJob.includes('git switch --force-create main "$checked_out_commit_sha"'));
  assert.ok(buildJob.includes("existing_commit_tags"));
  assert.ok(buildJob.includes("already tagged"));
  assert.ok(releaseWorkflow.includes("release-commit:"));
  assert.equal(releaseWorkflow.includes("ref: ${{ inputs.commit_sha }}"), false);
  assert.ok((releaseWorkflow.match(/ref: main/g)?.length ?? 0) >= 5);
  assert.ok(releaseWorkflow.includes("Require unchanged release commit"));
  assert.ok(
    buildJob.includes(
      'release-it "$RELEASE_INCREMENT" --release-version --no-git.push --no-github.release'
    )
  );
  assert.ok(buildJob.includes("expected_release_version"));
  assert.ok(buildJob.includes("IFS=. read -r latest_major latest_minor latest_patch"));
  assert.equal(buildJob.includes("semver.inc"), false);
  const fullDependencyAuditIndex = buildJob.indexOf("npm audit --audit-level=high");
  const releaseCandidateUploadIndex = buildJob.indexOf("Upload exact validated release candidate");
  assert.ok(fullDependencyAuditIndex > -1);
  assert.ok(fullDependencyAuditIndex < releaseCandidateUploadIndex);
  assert.ok(buildJob.includes("npm run audit:production"));
  assert.ok(releaseJob.includes("git fetch --no-tags origin main:refs/remotes/origin/main"));
  assert.ok(releaseJob.includes('npm run release -- "$RELEASE_VERSION"'));
  assert.ok(releaseJob.includes("- codeql"));
  assert.ok(releaseJob.includes("- gitleaks"));
  assert.ok(releaseJob.includes("- integration"));
  assert.ok(releaseJob.includes("persist-credentials: false"));
  assert.ok(releaseJob.includes("gh auth setup-git"));
  assert.ok(releaseJob.includes("Read back exact GitHub Release state and assets"));
  const releaseReadbackStep = workflowStep(
    releaseWorkflowDocument,
    "release",
    "Read back exact GitHub Release state and assets"
  );
  const marketplaceTagGuardStep = workflowStep(
    releaseWorkflowDocument,
    "marketplace",
    "Require remote release tag target before Marketplace publish"
  );
  const marketplaceReadbackStep = workflowStep(
    releaseWorkflowDocument,
    "marketplace",
    "Read back published Marketplace package"
  );
  assert.ok(releaseReadbackStep.run.includes("resolve_remote_tag_commit_sha"));
  assert.ok(releaseReadbackStep.run.includes("git/ref/tags/${RELEASE_TAG}"));
  assert.ok(releaseReadbackStep.run.includes("git/tags/${remote_tag_object_sha}"));
  assert.ok(releaseReadbackStep.run.includes('while [[ "$remote_tag_object_type" == "tag" ]]'));
  assert.equal(releaseReadbackStep.run.includes('git rev-parse "${RELEASE_TAG}^{commit}"'), false);
  assert.ok(
    releaseReadbackStep.run.indexOf('release_tag_commit_sha="$(resolve_remote_tag_commit_sha)"') <
      releaseReadbackStep.run.indexOf('release_tag_name="$(gh api "$release_api_path" --jq')
  );
  assert.ok(marketplaceTagGuardStep.run.includes("git/ref/tags/${RELEASE_TAG}"));
  assert.ok(marketplaceTagGuardStep.run.includes("git/tags/${remote_tag_object_sha}"));
  assert.ok(marketplaceTagGuardStep.run.includes('while [[ "$remote_tag_object_type" == "tag" ]]'));
  assert.ok(marketplaceTagGuardStep.run.includes("EXPECTED_RELEASE_COMMIT_SHA"));
  assert.ok(marketplaceReadbackStep.run.includes("git/ref/tags/${RELEASE_TAG}"));
  assert.ok(marketplaceReadbackStep.run.includes("git/tags/${remote_tag_object_sha}"));
  assert.ok(marketplaceReadbackStep.run.includes('while [[ "$remote_tag_object_type" == "tag" ]]'));
  assert.ok(marketplaceReadbackStep.run.includes("EXPECTED_RELEASE_COMMIT_SHA"));
  assert.ok(
    workflowStepIndex(
      releaseWorkflowDocument,
      "marketplace",
      "Require remote release tag target before Marketplace publish"
    ) < workflowStepIndex(releaseWorkflowDocument, "marketplace", "Publish exact release package")
  );
});

test("reuses one exact candidate across every release platform and publication", () => {
  const releaseWorkflow = repositoryFile(".github/workflows/release.yml");
  const releaseWorkflowDocument = workflowDocument(".github/workflows/release.yml");
  const buildJob = workflowJobBlock(releaseWorkflow, "build");
  const integrationJob = workflowJobBlock(releaseWorkflow, "integration");
  const releaseJob = workflowJobBlock(releaseWorkflow, "release");

  const releaseCandidateUploadStep = workflowStep(
    releaseWorkflowDocument,
    "build",
    "Upload exact validated release candidate"
  );
  assert.equal(releaseCandidateUploadStep.with.name, "validated-vsix");
  assert.equal(releaseCandidateUploadStep.with["if-no-files-found"], "error");
  assert.ok(buildJob.includes("node scripts/package-release.mjs"));
  assert.ok(buildJob.includes("node scripts/verify-release-package.mjs"));
  assert.ok(buildJob.includes("name: validated-vsix"));
  assert.ok(
    buildJob.indexOf("Upload exact validated release candidate") >
      buildJob.indexOf("Audit production dependencies")
  );
  assert.ok(integrationJob.includes("actions/download-artifact@"));
  assert.ok(integrationJob.includes("name: validated-vsix"));
  assert.equal(integrationJob.includes("npm run package:vsix"), false);
  assert.ok(integrationJob.includes("operating-system: windows-latest"));
  assert.ok(integrationJob.includes("operating-system: macos-latest"));
  assert.ok(integrationJob.includes("vscode-version: 1.95.3"));
  assert.ok(releaseJob.includes("Download exact tested release package"));
  assert.equal(releaseJob.includes("npm run package:vsix"), false);
  const marketplaceCandidateDownloadStep = workflowStep(
    releaseWorkflowDocument,
    "marketplace",
    "Download exact validated release candidate"
  );
  const marketplaceCompareStep = workflowStep(
    releaseWorkflowDocument,
    "marketplace",
    "Download and compare immutable GitHub Release assets"
  );
  const marketplacePublishStep = workflowStep(
    releaseWorkflowDocument,
    "marketplace",
    "Publish exact release package"
  );
  const marketplaceReadbackStep = workflowStep(
    releaseWorkflowDocument,
    "marketplace",
    "Read back published Marketplace package"
  );
  assert.equal(
    marketplaceCandidateDownloadStep.uses,
    "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c"
  );
  assert.equal(marketplaceCandidateDownloadStep.with.name, "validated-vsix");
  assert.ok(marketplaceCompareStep.run.includes('cmp -- "dist/${release_package_name}"'));
  assert.ok(marketplaceCompareStep.run.includes('sha256sum --check "$release_checksum_name"'));
  assert.equal(marketplacePublishStep.env.VSCE_PAT, "${{ secrets.VSCE_PAT }}");
  assert.equal(Object.keys(marketplacePublishStep.env).length, 2);
  assert.ok(marketplacePublishStep.run.includes("dist/everforest-complete-"));
  assert.ok(marketplacePublishStep.run.includes("--packagePath"));
  assert.ok(marketplacePublishStep.run.includes("--skip-duplicate"));
  assert.ok(marketplaceReadbackStep.run.includes("verify-marketplace-publication.sh"));
  assert.ok(
    workflowStepIndex(releaseWorkflowDocument, "marketplace", "Publish exact release package") <
      workflowStepIndex(
        releaseWorkflowDocument,
        "marketplace",
        "Read back published Marketplace package"
      )
  );
  assert.equal(
    marketplaceWorkflowSecretReferenceCount(releaseWorkflowDocument),
    1,
    "Marketplace secret is referenced only by the publish step"
  );
});

test("keeps release recovery manual and cross-platform", () => {
  const recoveryWorkflow = repositoryFile(".github/workflows/github-release-recovery.yml");
  const recoveryWorkflowDocument = workflowDocument(
    ".github/workflows/github-release-recovery.yml"
  );
  const recoveryIntegrationJob = workflowJobBlock(recoveryWorkflow, "integration");
  const recoveryPublishJob = workflowJobBlock(recoveryWorkflow, "publish");
  const recoveryPublishCreateStep = workflowStep(
    recoveryWorkflowDocument,
    "publish",
    "Create missing immutable GitHub Release"
  );
  const recoveryPublishReadbackStep = workflowStep(
    recoveryWorkflowDocument,
    "publish",
    "Read back exact recovered release state and assets"
  );

  assert.deepEqual(Object.keys(recoveryWorkflowDocument.on.workflow_dispatch.inputs), [
    "source_run_id",
    "tag",
  ]);
  assert.equal(recoveryWorkflowDocument.jobs.publish.permissions.contents, "write");
  assert.equal(
    workflowStep(
      recoveryWorkflowDocument,
      "publish",
      "Download exact release candidate from failed run"
    ).with["run-id"],
    "${{ inputs.source_run_id }}"
  );
  assert.ok(recoveryWorkflow.includes("source_run_id:"));
  assert.ok(recoveryWorkflow.includes("Validate failed Release run"));
  assert.ok(recoveryWorkflow.includes("candidate_artifact_count"));
  assert.ok(recoveryWorkflow.includes("workflow_run.head_sha"));
  assert.ok(recoveryWorkflow.includes("name: validated-vsix"));
  assert.equal(recoveryWorkflow.includes("npm run package:vsix"), false);
  assert.equal(recoveryWorkflow.includes("scripts/package-release.mjs"), false);
  assert.equal(recoveryWorkflow.includes("--clobber"), false);
  for (const recoverySetupNodeStep of Object.values(recoveryWorkflowDocument.jobs)
    .flatMap((recoveryJob) => recoveryJob.steps ?? [])
    .filter((recoveryStep) => recoveryStep.uses?.startsWith("actions/setup-node@"))) {
    assert.equal(recoverySetupNodeStep.with["node-version"], "24.14.0");
    assert.equal(recoverySetupNodeStep.with.cache, undefined);
  }
  assert.ok(recoveryIntegrationJob.includes("operating-system: windows-latest"));
  assert.ok(recoveryIntegrationJob.includes("operating-system: macos-latest"));
  assert.ok(recoveryIntegrationJob.includes("vscode-version: 1.95.3"));
  assert.ok(recoveryIntegrationJob.includes("run-id: ${{ inputs.source_run_id }}"));
  assert.ok(recoveryPublishJob.includes("Create missing immutable GitHub Release"));
  assert.ok(recoveryPublishJob.includes("already exists; validating it without mutation"));
  assert.ok(recoveryPublishJob.includes("gh api --include"));
  assert.equal(recoveryPublishJob.includes("--clobber"), false);
  assert.ok(recoveryPublishJob.includes("Read back exact recovered release state and assets"));
  assert.equal(
    recoveryPublishCreateStep.env.EXPECTED_COMMIT_SHA,
    "${{ needs.validate-source.outputs.source_commit }}"
  );
  assert.equal(recoveryWorkflow.includes("ref: ${{ inputs.tag }}"), false);
  assert.equal(
    recoveryWorkflowDocument.jobs["validate-source"].outputs.source_commit,
    "${{ steps.validate-source.outputs.source_commit }}"
  );
  for (const recoveryJobName of ["validate-candidate", "integration", "publish"]) {
    const recoveryJob = recoveryWorkflowDocument.jobs[recoveryJobName];
    const recoveryCheckoutStep = recoveryJob.steps.find((step) =>
      step.uses?.startsWith("actions/checkout@")
    );
    assert.ok(recoveryCheckoutStep, `${recoveryJobName} checks out source`);
    assert.equal(recoveryCheckoutStep.with.ref, "main");
    assert.equal(recoveryCheckoutStep.with["fetch-depth"], 0);
    assert.equal(recoveryCheckoutStep.with["persist-credentials"], false);
    const recoveryCheckoutStepIndex = recoveryJob.steps.indexOf(recoveryCheckoutStep);
    const recoverySourceGuardStepIndex = recoveryJob.steps.findIndex(
      (step) => step.name === "Require validated source commit"
    );
    const recoveryNodeSetupStepIndex = recoveryJob.steps.findIndex(
      (step) => step.name === "Set up Node.js"
    );
    assert.ok(recoverySourceGuardStepIndex > recoveryCheckoutStepIndex);
    assert.ok(
      recoveryNodeSetupStepIndex === -1 || recoverySourceGuardStepIndex < recoveryNodeSetupStepIndex
    );
    assert.ok(
      recoveryJob.steps.some((step) => step.name === "Require validated source commit"),
      `${recoveryJobName} asserts the validated source commit`
    );
    const recoverySourceGuardStep = recoveryJob.steps[recoverySourceGuardStepIndex];
    if (recoveryJobName === "integration") {
      assert.equal(recoverySourceGuardStep.shell, "bash");
    }
    assert.ok(
      recoverySourceGuardStep.run.includes('git checkout --detach "$EXPECTED_SOURCE_COMMIT_SHA"'),
      `${recoveryJobName} detaches only after the source commit is validated`
    );
  }
  assert.ok(recoveryPublishCreateStep.run.includes("resolve_remote_tag_commit_sha"));
  assert.ok(recoveryPublishCreateStep.run.includes("git/ref/tags/${RELEASE_TAG}"));
  assert.ok(recoveryPublishCreateStep.run.includes("git/tags/${remote_tag_object_sha}"));
  const releaseCreationCommandIndex = recoveryPublishCreateStep.run.indexOf("gh release create");
  const preCreationTagValidationIndex = recoveryPublishCreateStep.run.lastIndexOf(
    "validate_remote_tag_target",
    releaseCreationCommandIndex
  );
  const postCreationTagValidationIndex = recoveryPublishCreateStep.run.indexOf(
    "validate_remote_tag_target",
    releaseCreationCommandIndex + "gh release create".length
  );
  assert.ok(preCreationTagValidationIndex > -1);
  assert.ok(postCreationTagValidationIndex > releaseCreationCommandIndex);
  assert.equal(
    recoveryPublishCreateStep.run
      .slice(preCreationTagValidationIndex, releaseCreationCommandIndex)
      .trim(),
    "validate_remote_tag_target"
  );
  assert.ok(recoveryPublishReadbackStep.run.includes("git/ref/tags/${RELEASE_TAG}"));
  assert.ok(recoveryPublishReadbackStep.run.includes("git/tags/${release_tag_object_sha}"));
  assert.ok(
    recoveryPublishJob.indexOf("already exists; validating it without mutation") <
      recoveryPublishJob.indexOf("Read back exact recovered release state and assets")
  );
});

test("keeps Marketplace recovery protected, tag-only, and exact-artifact based", () => {
  const marketplaceRecoveryWorkflow = repositoryFile(".github/workflows/marketplace-recovery.yml");
  const marketplaceRecoveryWorkflowDocument = workflowDocument(
    ".github/workflows/marketplace-recovery.yml"
  );
  const marketplaceRecoveryJob = workflowJobBlock(marketplaceRecoveryWorkflow, "publish");
  const marketplaceRecoveryValidationJob = workflowJobBlock(
    marketplaceRecoveryWorkflow,
    "validate-source"
  );

  assert.deepEqual(Object.keys(marketplaceRecoveryWorkflowDocument.on.workflow_dispatch.inputs), [
    "tag",
  ]);
  assert.equal(marketplaceRecoveryWorkflowDocument.jobs.publish.needs, "validate-source");
  assert.equal(marketplaceRecoveryWorkflowDocument.jobs["validate-source"].environment, undefined);
  assert.equal(
    marketplaceRecoveryWorkflowDocument.jobs["validate-source"].outputs.source_commit,
    "${{ steps.validate-source.outputs.source_commit }}"
  );
  assert.equal(
    marketplaceRecoveryWorkflowDocument.jobs.publish.environment,
    "marketplace-production"
  );
  assert.equal(marketplaceRecoveryWorkflowDocument.jobs.publish.permissions.contents, "read");
  assert.ok(marketplaceRecoveryWorkflow.includes("tag:"));
  assert.ok(marketplaceRecoveryWorkflow.includes("environment: marketplace-production"));
  assert.equal(marketplaceRecoveryWorkflow.includes("ref: ${{ inputs.tag }}"), false);
  for (const recoverySetupNodeStep of Object.values(marketplaceRecoveryWorkflowDocument.jobs)
    .flatMap((recoveryJob) => recoveryJob.steps ?? [])
    .filter((recoveryStep) => recoveryStep.uses?.startsWith("actions/setup-node@"))) {
    assert.equal(recoverySetupNodeStep.with["node-version"], "24.14.0");
  }
  assert.ok(marketplaceRecoveryValidationJob.includes("git/ref/tags/${RELEASE_TAG}"));
  assert.ok(marketplaceRecoveryValidationJob.includes("git/tags/${remote_tag_object_sha}"));
  assert.ok(
    marketplaceRecoveryValidationJob.includes('while [[ "$remote_tag_object_type" == "tag" ]]')
  );
  assert.ok(marketplaceRecoveryValidationJob.includes("branches/main"));
  assert.ok(marketplaceRecoveryValidationJob.includes("compare/${source_commit_sha}...main"));
  assert.equal(marketplaceRecoveryValidationJob.includes("VSCE_PAT"), false);
  const marketplaceRecoveryCheckoutStep = workflowStep(
    marketplaceRecoveryWorkflowDocument,
    "publish",
    "Check out validated source commit"
  );
  assert.equal(
    marketplaceRecoveryCheckoutStep.with.ref,
    "${{ needs.validate-source.outputs.source_commit }}"
  );
  const marketplaceRecoverySourceGuardStep = workflowStep(
    marketplaceRecoveryWorkflowDocument,
    "publish",
    "Revalidate protected source before PAT publish"
  );
  assert.ok(marketplaceRecoverySourceGuardStep.run.includes("git rev-parse HEAD"));
  assert.ok(marketplaceRecoverySourceGuardStep.run.includes("git/ref/tags/${RELEASE_TAG}"));
  assert.ok(marketplaceRecoverySourceGuardStep.run.includes("git/tags/${remote_tag_object_sha}"));
  assert.ok(
    marketplaceRecoverySourceGuardStep.run.includes("compare/${EXPECTED_SOURCE_COMMIT_SHA}...main")
  );
  const marketplaceRecoverySourceGuardStepIndex = workflowStepIndex(
    marketplaceRecoveryWorkflowDocument,
    "publish",
    "Revalidate protected source before PAT publish"
  );
  const marketplaceRecoveryPublishStepIndex = workflowStepIndex(
    marketplaceRecoveryWorkflowDocument,
    "publish",
    "Publish exact GitHub Release VSIX"
  );
  assert.equal(marketplaceRecoverySourceGuardStepIndex + 1, marketplaceRecoveryPublishStepIndex);
  assert.ok(marketplaceRecoveryJob.includes("gh release download"));
  assert.ok(marketplaceRecoveryJob.includes("sha256sum --check"));
  assert.ok(marketplaceRecoveryJob.includes("scripts/verify-release-package.mjs"));
  const marketplaceRecoveryDownloadStep = workflowStep(
    marketplaceRecoveryWorkflowDocument,
    "publish",
    "Download and verify immutable GitHub Release assets"
  );
  const marketplaceRecoveryPublishStep = workflowStep(
    marketplaceRecoveryWorkflowDocument,
    "publish",
    "Publish exact GitHub Release VSIX"
  );
  const marketplaceRecoveryReadbackStep = workflowStep(
    marketplaceRecoveryWorkflowDocument,
    "publish",
    "Read back published Marketplace package"
  );
  assert.ok(marketplaceRecoveryDownloadStep.run.includes("gh release download"));
  assert.equal(marketplaceRecoveryPublishStep.env.VSCE_PAT, "${{ secrets.VSCE_PAT }}");
  assert.equal(Object.keys(marketplaceRecoveryPublishStep.env).length, 2);
  assert.ok(marketplaceRecoveryPublishStep.run.includes("--packagePath"));
  assert.ok(marketplaceRecoveryPublishStep.run.includes("--skip-duplicate"));
  assert.ok(marketplaceRecoveryReadbackStep.run.includes("verify-marketplace-publication.sh"));
  assert.ok(marketplaceRecoveryReadbackStep.run.includes("git/ref/tags/${RELEASE_TAG}"));
  assert.ok(marketplaceRecoveryReadbackStep.run.includes("git/tags/${remote_tag_object_sha}"));
  assert.ok(marketplaceRecoveryReadbackStep.run.includes("EXPECTED_SOURCE_COMMIT_SHA"));
  assert.ok(
    workflowStepIndex(
      marketplaceRecoveryWorkflowDocument,
      "publish",
      "Publish exact GitHub Release VSIX"
    ) <
      workflowStepIndex(
        marketplaceRecoveryWorkflowDocument,
        "publish",
        "Read back published Marketplace package"
      )
  );
  assert.equal(
    marketplaceWorkflowSecretReferenceCount(marketplaceRecoveryWorkflowDocument),
    1,
    "Marketplace recovery secret is referenced only by the publish step"
  );
  assert.equal(marketplaceRecoveryJob.includes("package:vsix"), false);
});

test("bounds Marketplace endpoint and catalog readback", () => {
  const marketplacePublicationVerifier = repositoryFile(
    "scripts/verify-marketplace-publication.sh"
  );

  assert.ok(marketplacePublicationVerifier.includes("--connect-timeout 20"));
  assert.ok(marketplacePublicationVerifier.includes("marketplace_curl_max_time_seconds=120"));
  assert.ok(marketplacePublicationVerifier.includes("--retry 2"));
  assert.ok(marketplacePublicationVerifier.includes('cmp -- "$release_package_path"'));
  assert.ok(marketplacePublicationVerifier.includes("extensionquery"));
  assert.ok(marketplacePublicationVerifier.includes("catalog_version_count"));
  assert.ok(marketplacePublicationVerifier.includes("MARKETPLACE_POLL_DEADLINE_SECONDS"));
  assert.ok(marketplacePublicationVerifier.includes("marketplace_poll_deadline_epoch"));
  assert.ok(marketplacePublicationVerifier.includes("while :; do"));
  assert.ok(
    marketplacePublicationVerifier.includes('marketplace_endpoint_verification_status="stale"')
  );
  assert.ok(
    marketplacePublicationVerifier.includes('marketplace_catalog_verification_status="stale"')
  );
  assert.ok(marketplacePublicationVerifier.includes("marketplace_poll_max_delay_seconds=30"));
  assert.ok(marketplacePublicationVerifier.includes('sleep "$marketplace_sleep_seconds"'));
  assert.ok(marketplacePublicationVerifier.includes("Marketplace publication timed out after"));
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
