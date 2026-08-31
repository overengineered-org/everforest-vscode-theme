import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const repositoryDirectory = resolve(import.meta.dirname, "../..");

function repositoryFile(relativePath) {
  return readFileSync(resolve(repositoryDirectory, relativePath), "utf8");
}

function runCodeqlAnalysis(overrides) {
  return spawnSync("bash", [resolve(repositoryDirectory, "scripts/run-codeql-analysis.sh")], {
    cwd: repositoryDirectory,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEQL_BINARY_PATH: "/bin/true",
      CODEQL_ANALYSIS_DIRECTORY: "/tmp/everforest-codeql-policy-analysis",
      CODEQL_RESULTS_DIRECTORY: "/tmp/everforest-codeql-policy-results",
      ...overrides,
    },
  });
}

function runCodeqlInstaller(overrides) {
  return spawnSync("/bin/bash", [resolve(repositoryDirectory, "scripts/install-codeql.sh")], {
    cwd: repositoryDirectory,
    encoding: "utf8",
    env: {
      ...process.env,
      ...overrides,
    },
  });
}

function runChecksumVerifier(vsixContents, checksumContents, checksumVerifierSource) {
  const temporaryChecksumTestDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-vsix-checksum-policy-")
  );
  const temporaryVsixPath = resolve(temporaryChecksumTestDirectory, "everforest-complete.vsix");
  const temporaryChecksumPath = `${temporaryVsixPath}.sha256`;
  writeFileSync(temporaryVsixPath, vsixContents);
  writeFileSync(temporaryChecksumPath, checksumContents);

  try {
    return spawnSync(
      "bash",
      ["-c", `${checksumVerifierSource}\nvalidate_exact_vsix_checksum "policy test"`],
      {
        cwd: repositoryDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          validated_vsix_path: temporaryVsixPath,
          validated_vsix_checksum_path: temporaryChecksumPath,
        },
      }
    );
  } finally {
    rmSync(temporaryChecksumTestDirectory, { force: true, recursive: true });
  }
}

test("isolates ACT dependencies and removes failed containers", () => {
  const actConfiguration = repositoryFile(".actrc");
  const actWorkflow = repositoryFile(".act/workflows/verify.yml");
  const localValidationScript = repositoryFile("scripts/verify-local.sh");

  assert.match(actConfiguration, /^--bind$/m);
  assert.match(actConfiguration, /^--rm$/m);
  assert.doesNotMatch(actConfiguration, /^--reuse$/m);
  assert.match(actConfiguration, /everforest-codeql-cache:\/opt\/codeql-cache/);
  assert.match(
    actWorkflow,
    /container:\n\s+options: >-\n\s+-v=everforest-codeql-cache:\/opt\/codeql-cache\s+-v=\/github\/workspace\/node_modules/
  );
  assert.match(
    localValidationScript,
    /--container-options="-v=everforest-codeql-cache:\/opt\/codeql-cache -v=\/github\/workspace\/node_modules"/
  );
  assert.doesNotMatch(localValidationScript, /-v=\$\{project_worktree_root\}\/node_modules/);
  assert.doesNotMatch(localValidationScript, /docker (?:image|container) prune/);
});

test("builds one ACT VSIX and verifies unchanged bytes on macOS", () => {
  const actWorkflow = repositoryFile(".act/workflows/verify.yml");
  const localValidationScript = repositoryFile("scripts/verify-local.sh");
  const packageManifest = JSON.parse(repositoryFile("package.json"));

  assert.equal((actWorkflow.match(/npm run package:vsix/g) ?? []).length, 1);
  assert.equal((localValidationScript.match(/npm run package:vsix/g) ?? []).length, 0);
  assert.match(packageManifest.scripts["package:vsix"], /scripts\/package-checksum\.mjs/);
  assert.ok(localValidationScript.includes("validated_vsix_checksum_path"));
  assert.ok(localValidationScript.includes("cmp -s"));
  assert.ok(localValidationScript.includes("shasum -a 256"));
  assert.ok(localValidationScript.includes("ACT VSIX bytes changed"));
  assert.ok(
    localValidationScript.includes('validate_exact_vsix_checksum "native macOS integration"')
  );
  assert.ok(
    localValidationScript.indexOf('bash "$local_node_environment" npm ci') <
      localValidationScript.indexOf("act \\")
  );
});

test("uses conservative validated CodeQL parallelism and setup prerequisites", () => {
  const codeqlAnalysisScript = repositoryFile("scripts/run-codeql-analysis.sh");
  const setupScript = repositoryFile(".codex/environments/setup.sh");

  assert.match(codeqlAnalysisScript, /default_codeql_thread_count=2/);
  assert.match(codeqlAnalysisScript, /maximum_codeql_thread_count=4/);
  assert.match(codeqlAnalysisScript, /CODEQL_THREADS must be a positive integer from 1 to/);
  assert.doesNotMatch(codeqlAnalysisScript, /--threads=0/);
  assert.ok(
    codeqlAnalysisScript.includes(
      'node "${project_worktree_root}/scripts/assert-codeql-results.mjs"'
    )
  );
  assert.match(
    setupScript,
    /for required_workflow_tool in act cmp awk docker git gh gitleaks npm shasum;/
  );
});

test("requires Linux flock before installing CodeQL", () => {
  const temporaryMissingFlockDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-codeql-missing-flock-")
  );
  const canonicalMissingFlockDirectory = realpathSync(temporaryMissingFlockDirectory);

  try {
    const installerRun = spawnSync(
      "/bin/bash",
      [resolve(repositoryDirectory, "scripts/install-codeql.sh")],
      {
        cwd: repositoryDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEQL_INSTALLATION_ROOT: resolve(canonicalMissingFlockDirectory, "cache"),
          PATH: temporaryMissingFlockDirectory,
        },
      }
    );
    assert.equal(installerRun.status, 69);
    assert.match(installerRun.stderr, /requires Linux flock/);
  } finally {
    rmSync(temporaryMissingFlockDirectory, { force: true, recursive: true });
  }
});

test("uses the bounded flock file while installing a missing CodeQL bundle", () => {
  const temporaryCodeqlInstallTestDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-codeql-install-policy-")
  );
  const canonicalCodeqlInstallTestDirectory = realpathSync(temporaryCodeqlInstallTestDirectory);
  const stubCommandDirectory = resolve(temporaryCodeqlInstallTestDirectory, "bin");
  const codeqlInstallationRoot = resolve(
    canonicalCodeqlInstallTestDirectory,
    "CodeQL Cache With Spaces"
  );
  const orphanedCodeqlStagingDirectory = resolve(codeqlInstallationRoot, "install-2.26.4.sigkill");
  const unrelatedCodeqlStagingDirectory = resolve(codeqlInstallationRoot, "install-2.26.3.keep");
  mkdirSync(stubCommandDirectory);
  mkdirSync(orphanedCodeqlStagingDirectory, { recursive: true });
  mkdirSync(unrelatedCodeqlStagingDirectory, { recursive: true });

  function writeExecutableStub(commandName, shellSource) {
    const stubCommandPath = resolve(stubCommandDirectory, commandName);
    writeFileSync(stubCommandPath, shellSource, { mode: 0o755 });
    chmodSync(stubCommandPath, 0o755);
  }

  writeExecutableStub(
    "flock",
    `#!/bin/sh
printf 'flock invocation: %s\\n' "$*" >&2
`
  );
  writeExecutableStub(
    "curl",
    `#!/bin/sh
set -eu
output_path=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then
    shift
    output_path="$1"
  fi
  shift
done
: > "$output_path"
`
  );
  writeExecutableStub(
    "sha256sum",
    `#!/bin/sh
cat >/dev/null
`
  );
  writeExecutableStub(
    "tar",
    `#!/bin/sh
set -eu
mkdir -p codeql
printf '%s\\n' '#!/bin/sh' 'printf "%s\\n" "CodeQL stub"' > codeql/codeql
chmod +x codeql/codeql
`
  );

  try {
    const installerRun = spawnSync(
      "/bin/bash",
      [resolve(repositoryDirectory, "scripts/install-codeql.sh")],
      {
        cwd: repositoryDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEQL_INSTALLATION_ROOT: codeqlInstallationRoot,
          PATH: `${stubCommandDirectory}:/usr/bin:/bin`,
        },
      }
    );
    assert.equal(installerRun.status, 0, installerRun.stderr);
    assert.match(installerRun.stderr, /flock invocation: --exclusive --wait 120/);
    assert.ok(existsSync(resolve(codeqlInstallationRoot, "2.26.4/codeql")));
    assert.equal(existsSync(orphanedCodeqlStagingDirectory), false);
    assert.ok(existsSync(unrelatedCodeqlStagingDirectory));
  } finally {
    rmSync(temporaryCodeqlInstallTestDirectory, { force: true, recursive: true });
  }
});

test("requires an absolute canonical dedicated CodeQL cache root", () => {
  const temporaryCodeqlRootPolicyDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-codeql-root-policy-")
  );
  const canonicalRootPolicyDirectory = realpathSync(temporaryCodeqlRootPolicyDirectory);
  const symlinkedCodeqlRoot = resolve(canonicalRootPolicyDirectory, "symlinked-cache");
  const realCodeqlRoot = resolve(canonicalRootPolicyDirectory, "real-cache");
  mkdirSync(resolve(canonicalRootPolicyDirectory, "nested"));
  symlinkSync(realCodeqlRoot, symlinkedCodeqlRoot, "dir");

  try {
    const rejectedRootCases = [
      {
        root: "relative-codeql-cache",
        message: /absolute canonical non-symlink directory/,
      },
      {
        root: `${canonicalRootPolicyDirectory}/nested/../non-canonical-cache`,
        message: /absolute canonical non-symlink directory/,
      },
      {
        root: `${canonicalRootPolicyDirectory}/nested/..`,
        message: /absolute canonical non-symlink directory/,
      },
      {
        root: symlinkedCodeqlRoot,
        message: /absolute canonical non-symlink directory/,
      },
      {
        root: repositoryDirectory,
        message: /repository root or ancestor/,
      },
    ];

    for (const rejectedRootCase of rejectedRootCases) {
      const installerRun = runCodeqlInstaller({
        CODEQL_INSTALLATION_ROOT: rejectedRootCase.root,
      });
      assert.equal(installerRun.status, 64, rejectedRootCase.root);
      assert.match(installerRun.stderr, rejectedRootCase.message);
    }
  } finally {
    rmSync(temporaryCodeqlRootPolicyDirectory, { force: true, recursive: true });
  }
});

test("rejects symlinked CodeQL lock and orphan staging targets before mutation", () => {
  const temporaryCodeqlSymlinkPolicyDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-codeql-symlink-policy-")
  );
  const canonicalSymlinkPolicyDirectory = realpathSync(temporaryCodeqlSymlinkPolicyDirectory);
  const stubCommandDirectory = resolve(canonicalSymlinkPolicyDirectory, "bin");
  const codeqlInstallationRoot = resolve(canonicalSymlinkPolicyDirectory, "CodeQL Cache");
  const lockTargetPath = resolve(canonicalSymlinkPolicyDirectory, "lock-target");
  const lockSymlinkPath = resolve(codeqlInstallationRoot, ".2.26.4.install.lock");
  const stagingTargetDirectory = resolve(canonicalSymlinkPolicyDirectory, "staging-target");
  const stagingSymlinkPath = resolve(codeqlInstallationRoot, "install-2.26.4.attack");
  mkdirSync(stubCommandDirectory);
  mkdirSync(codeqlInstallationRoot);
  writeFileSync(lockTargetPath, "preserve lock target\n");
  mkdirSync(stagingTargetDirectory);
  writeFileSync(resolve(stagingTargetDirectory, "sentinel"), "preserve staging target\n");
  writeFileSync(resolve(stubCommandDirectory, "flock"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  chmodSync(resolve(stubCommandDirectory, "flock"), 0o755);
  symlinkSync(lockTargetPath, lockSymlinkPath, "file");

  try {
    const symlinkedLockRun = runCodeqlInstaller({
      CODEQL_INSTALLATION_ROOT: codeqlInstallationRoot,
      PATH: `${stubCommandDirectory}:/usr/bin:/bin`,
    });
    assert.equal(symlinkedLockRun.status, 1);
    assert.match(symlinkedLockRun.stderr, /CodeQL lock path; symlink targets are rejected/);
    assert.equal(readFileSync(lockTargetPath, "utf8"), "preserve lock target\n");

    rmSync(lockSymlinkPath, { force: true });
    symlinkSync(stagingTargetDirectory, stagingSymlinkPath, "dir");
    const symlinkedStagingRun = runCodeqlInstaller({
      CODEQL_INSTALLATION_ROOT: codeqlInstallationRoot,
      PATH: `${stubCommandDirectory}:/usr/bin:/bin`,
    });
    assert.equal(symlinkedStagingRun.status, 1);
    assert.match(
      symlinkedStagingRun.stderr,
      /CodeQL orphan staging path; symlink targets are rejected/
    );
    assert.equal(
      readFileSync(resolve(stagingTargetDirectory, "sentinel"), "utf8"),
      "preserve staging target\n"
    );
  } finally {
    rmSync(temporaryCodeqlSymlinkPolicyDirectory, { force: true, recursive: true });
  }
});

test("asserts CodeQL results independently of the caller CWD", () => {
  const temporaryCodeqlCwdTestDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-codeql-cwd-policy-")
  );
  const canonicalCodeqlCwdTestDirectory = realpathSync(temporaryCodeqlCwdTestDirectory);
  const codeqlStubPath = resolve(temporaryCodeqlCwdTestDirectory, "codeql-stub");
  const analysisDirectory = resolve(canonicalCodeqlCwdTestDirectory, "everforest-codeql-analysis");
  const resultsDirectory = resolve(canonicalCodeqlCwdTestDirectory, "everforest-codeql-results");
  writeFileSync(
    codeqlStubPath,
    `#!/bin/sh
set -eu
if [ "$1" = database ] && [ "$2" = create ]; then
  mkdir -p "$3"
  exit 0
fi
if [ "$1" = database ] && [ "$2" = analyze ]; then
  for codeql_argument in "$@"; do
    case "$codeql_argument" in
      --output=*) codeql_output_path=\${codeql_argument#--output=} ;;
    esac
  done
  printf '%s\\n' '{"runs":[{"results":[]}]}' > "$codeql_output_path"
  exit 0
fi
exit 1
`,
    { mode: 0o755 }
  );
  chmodSync(codeqlStubPath, 0o755);

  try {
    const codeqlRun = spawnSync(
      "/bin/bash",
      [resolve(repositoryDirectory, "scripts/run-codeql-analysis.sh")],
      {
        cwd: temporaryCodeqlCwdTestDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          CODEQL_BINARY_PATH: codeqlStubPath,
          CODEQL_ANALYSIS_DIRECTORY: analysisDirectory,
          CODEQL_RESULTS_DIRECTORY: resultsDirectory,
          GITHUB_WORKSPACE: repositoryDirectory,
        },
      }
    );
    assert.equal(codeqlRun.status, 0, codeqlRun.stderr);
    assert.match(codeqlRun.stdout, /CodeQL passed across 2 required SARIF result files/);
  } finally {
    rmSync(temporaryCodeqlCwdTestDirectory, { force: true, recursive: true });
  }
});

test("rejects zero and over-maximum CodeQL thread overrides", () => {
  const codeqlAnalysisScriptPath = resolve(repositoryDirectory, "scripts/run-codeql-analysis.sh");
  const codeqlEnvironment = {
    ...process.env,
    CODEQL_BINARY_PATH: "/bin/true",
    CODEQL_ANALYSIS_DIRECTORY: "/tmp/everforest-codeql-policy-analysis",
    CODEQL_RESULTS_DIRECTORY: "/tmp/everforest-codeql-policy-results",
  };

  for (const rejectedThreadCount of ["0", "5"]) {
    const codeqlRun = spawnSync("bash", [codeqlAnalysisScriptPath], {
      cwd: repositoryDirectory,
      encoding: "utf8",
      env: { ...codeqlEnvironment, CODEQL_THREADS: rejectedThreadCount },
    });
    assert.equal(codeqlRun.status, 64, `rejects CODEQL_THREADS=${rejectedThreadCount}`);
    assert.match(codeqlRun.stderr, /CODEQL_THREADS must be a positive integer from 1 to 4/);
  }
});

test("rejects broad, aliased, and symlinked CodeQL paths before deletion", () => {
  const temporaryCodeqlTestDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-codeql-path-policy-")
  );
  const repositoryAliasPath = resolve(temporaryCodeqlTestDirectory, "repository-alias");
  const symlinkedAnalysisPath = resolve(temporaryCodeqlTestDirectory, "everforest-codeql-analysis");
  symlinkSync(repositoryDirectory, repositoryAliasPath, "dir");
  symlinkSync(repositoryDirectory, symlinkedAnalysisPath, "dir");

  try {
    const broadDirectoryRun = runCodeqlAnalysis({
      CODEQL_ANALYSIS_DIRECTORY: temporaryCodeqlTestDirectory,
    });
    assert.equal(broadDirectoryRun.status, 64);
    assert.match(broadDirectoryRun.stderr, /absolute path ending in/);

    const aliasedRepositoryRun = runCodeqlAnalysis({
      CODEQL_ANALYSIS_DIRECTORY: repositoryAliasPath,
    });
    assert.equal(aliasedRepositoryRun.status, 64);
    assert.match(aliasedRepositoryRun.stderr, /absolute path ending in/);

    const symlinkedDirectoryRun = runCodeqlAnalysis({
      CODEQL_ANALYSIS_DIRECTORY: symlinkedAnalysisPath,
    });
    assert.equal(symlinkedDirectoryRun.status, 64);
    assert.match(symlinkedDirectoryRun.stderr, /symlink targets are rejected/);
  } finally {
    rmSync(temporaryCodeqlTestDirectory, { force: true, recursive: true });
  }
});

test("rejects symlinked and non-canonical CodeQL parents before deletion", () => {
  const temporaryCodeqlParentPolicyDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-codeql-parent-policy-")
  );
  const canonicalParentPolicyDirectory = realpathSync(temporaryCodeqlParentPolicyDirectory);
  const realAnalysisParentDirectory = resolve(canonicalParentPolicyDirectory, "analysis-parent");
  const symlinkedAnalysisParentDirectory = resolve(
    canonicalParentPolicyDirectory,
    "analysis-parent-alias"
  );
  const realResultsParentDirectory = resolve(canonicalParentPolicyDirectory, "results-parent");
  const symlinkedResultsParentDirectory = resolve(
    canonicalParentPolicyDirectory,
    "results-parent-alias"
  );
  mkdirSync(realAnalysisParentDirectory);
  mkdirSync(realResultsParentDirectory);
  symlinkSync(realAnalysisParentDirectory, symlinkedAnalysisParentDirectory, "dir");
  symlinkSync(realResultsParentDirectory, symlinkedResultsParentDirectory, "dir");
  const analysisSentinelPath = resolve(
    realAnalysisParentDirectory,
    "everforest-codeql-analysis",
    "sentinel"
  );
  const resultsSentinelPath = resolve(
    realResultsParentDirectory,
    "everforest-codeql-results",
    "sentinel"
  );
  mkdirSync(resolve(realAnalysisParentDirectory, "everforest-codeql-analysis"));
  mkdirSync(resolve(realResultsParentDirectory, "everforest-codeql-results"));
  writeFileSync(analysisSentinelPath, "preserve analysis\n");
  writeFileSync(resultsSentinelPath, "preserve results\n");

  try {
    const symlinkedAnalysisParentRun = runCodeqlAnalysis({
      CODEQL_ANALYSIS_DIRECTORY: resolve(
        symlinkedAnalysisParentDirectory,
        "everforest-codeql-analysis"
      ),
      CODEQL_RESULTS_DIRECTORY: resolve(realResultsParentDirectory, "everforest-codeql-results"),
    });
    assert.equal(symlinkedAnalysisParentRun.status, 64);
    assert.match(symlinkedAnalysisParentRun.stderr, /symlinked parent is rejected/);
    assert.equal(readFileSync(analysisSentinelPath, "utf8"), "preserve analysis\n");

    const symlinkedResultsParentRun = runCodeqlAnalysis({
      CODEQL_ANALYSIS_DIRECTORY: resolve(realAnalysisParentDirectory, "everforest-codeql-analysis"),
      CODEQL_RESULTS_DIRECTORY: resolve(
        symlinkedResultsParentDirectory,
        "everforest-codeql-results"
      ),
    });
    assert.equal(symlinkedResultsParentRun.status, 64);
    assert.match(symlinkedResultsParentRun.stderr, /symlinked parent is rejected/);
    assert.equal(readFileSync(resultsSentinelPath, "utf8"), "preserve results\n");

    const nonCanonicalAnalysisRun = runCodeqlAnalysis({
      CODEQL_ANALYSIS_DIRECTORY: `${canonicalParentPolicyDirectory}/analysis-parent/../analysis-parent/everforest-codeql-analysis`,
      CODEQL_RESULTS_DIRECTORY: resolve(realResultsParentDirectory, "everforest-codeql-results"),
    });
    assert.equal(nonCanonicalAnalysisRun.status, 64);
    assert.match(nonCanonicalAnalysisRun.stderr, /expected an absolute canonical path/);
    assert.equal(readFileSync(analysisSentinelPath, "utf8"), "preserve analysis\n");
  } finally {
    rmSync(temporaryCodeqlParentPolicyDirectory, { force: true, recursive: true });
  }
});

test("requires both named CodeQL SARIF results", () => {
  const temporaryCodeqlResultsPolicyDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-codeql-results-policy-")
  );
  const codeqlAssertionScriptPath = resolve(
    repositoryDirectory,
    "scripts/assert-codeql-results.mjs"
  );
  const emptyCodeqlSarifDocument = '{"runs":[{"results":[]}]}\n';

  try {
    writeFileSync(
      resolve(temporaryCodeqlResultsPolicyDirectory, "unrelated.sarif"),
      emptyCodeqlSarifDocument
    );
    const unrelatedOnlyRun = spawnSync(
      process.execPath,
      [codeqlAssertionScriptPath, temporaryCodeqlResultsPolicyDirectory],
      {
        encoding: "utf8",
      }
    );
    assert.notEqual(unrelatedOnlyRun.status, 0);
    assert.match(unrelatedOnlyRun.stderr, /actions\.sarif, javascript-typescript\.sarif/);

    writeFileSync(
      resolve(temporaryCodeqlResultsPolicyDirectory, "actions.sarif"),
      emptyCodeqlSarifDocument
    );
    const oneRequiredResultRun = spawnSync(
      process.execPath,
      [codeqlAssertionScriptPath, temporaryCodeqlResultsPolicyDirectory],
      {
        encoding: "utf8",
      }
    );
    assert.notEqual(oneRequiredResultRun.status, 0);
    assert.match(oneRequiredResultRun.stderr, /javascript-typescript\.sarif/);

    writeFileSync(
      resolve(temporaryCodeqlResultsPolicyDirectory, "javascript-typescript.sarif"),
      emptyCodeqlSarifDocument
    );
    const completeResultsRun = spawnSync(
      process.execPath,
      [codeqlAssertionScriptPath, temporaryCodeqlResultsPolicyDirectory],
      {
        encoding: "utf8",
      }
    );
    assert.equal(completeResultsRun.status, 0, completeResultsRun.stderr);
  } finally {
    rmSync(temporaryCodeqlResultsPolicyDirectory, { force: true, recursive: true });
  }
});

test("rejects a CodeQL directory that is an ancestor of the workspace", () => {
  const temporaryCodeqlTestDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-codeql-ancestor-policy-")
  );
  const canonicalCodeqlTestDirectory = realpathSync(temporaryCodeqlTestDirectory);
  const nestedWorkspaceDirectory = resolve(
    canonicalCodeqlTestDirectory,
    "everforest-codeql-analysis",
    "workspace"
  );
  const ancestorAnalysisDirectory = resolve(
    canonicalCodeqlTestDirectory,
    "everforest-codeql-analysis"
  );
  const resultsDirectory = resolve(canonicalCodeqlTestDirectory, "everforest-codeql-results");
  mkdirSync(nestedWorkspaceDirectory, { recursive: true });

  try {
    const ancestorDirectoryRun = runCodeqlAnalysis({
      GITHUB_WORKSPACE: nestedWorkspaceDirectory,
      CODEQL_ANALYSIS_DIRECTORY: ancestorAnalysisDirectory,
      CODEQL_RESULTS_DIRECTORY: resultsDirectory,
    });
    assert.equal(ancestorDirectoryRun.status, 64);
    assert.match(ancestorDirectoryRun.stderr, /repository root or ancestor/);
  } finally {
    rmSync(temporaryCodeqlTestDirectory, { force: true, recursive: true });
  }
});

test("accepts one exact checksum record and rejects extra records or mutation", () => {
  const localValidationScript = repositoryFile("scripts/verify-local.sh");
  const checksumVerifierStart = localValidationScript.indexOf("validate_exact_vsix_checksum() {");
  const checksumVerifierEnd = localValidationScript.indexOf(
    "\nacquire_validation_lock\n\nif",
    checksumVerifierStart
  );
  assert.notEqual(checksumVerifierStart, -1);
  assert.notEqual(checksumVerifierEnd, -1);
  const checksumVerifierSource = localValidationScript.slice(
    checksumVerifierStart,
    checksumVerifierEnd
  );
  const originalVsixContents = "original VSIX bytes";
  const originalVsixDigest = createHash("sha256").update(originalVsixContents).digest("hex");
  const exactChecksumRecord = `${originalVsixDigest}  everforest-complete.vsix\n`;

  assert.equal(
    runChecksumVerifier(originalVsixContents, exactChecksumRecord, checksumVerifierSource).status,
    0
  );
  assert.notEqual(
    runChecksumVerifier(
      originalVsixContents,
      `${exactChecksumRecord}\n${exactChecksumRecord}`,
      checksumVerifierSource
    ).status,
    0
  );
  assert.notEqual(
    runChecksumVerifier(
      originalVsixContents,
      `${originalVsixDigest}  everforest-complete.vsix extra\n`,
      checksumVerifierSource
    ).status,
    0
  );
  assert.notEqual(
    runChecksumVerifier(originalVsixContents, `${exactChecksumRecord} \n`, checksumVerifierSource)
      .status,
    0
  );
  assert.notEqual(
    runChecksumVerifier(originalVsixContents, exactChecksumRecord.trimEnd(), checksumVerifierSource)
      .status,
    0
  );
  assert.notEqual(
    runChecksumVerifier(
      originalVsixContents,
      `${originalVsixDigest}   everforest-complete.vsix\n`,
      checksumVerifierSource
    ).status,
    0
  );
  assert.notEqual(
    runChecksumVerifier("mutated VSIX bytes", exactChecksumRecord, checksumVerifierSource).status,
    0
  );
});

test("serializes all linked worktrees without broad cleanup", () => {
  const localValidationScript = repositoryFile("scripts/verify-local.sh");

  assert.ok(localValidationScript.includes("git rev-parse --git-common-dir"));
  assert.ok(localValidationScript.includes("canonical_git_common_directory"));
  assert.ok(localValidationScript.includes("validation_lock_metadata_file"));
  assert.ok(localValidationScript.includes("validation_lock_reservation_file_prefix"));
  assert.ok(localValidationScript.includes("validation_lock_initialization_grace_seconds=5"));
  assert.ok(localValidationScript.includes("another Git repository"));
  assert.ok(localValidationScript.includes('mkdir -- "$validation_lock_directory"'));
  assert.ok(localValidationScript.includes('[[ -L "$validation_lock_directory" ]]'));
  assert.ok(localValidationScript.includes("rm -f -- ./owner"));
  assert.ok(localValidationScript.includes("set -C"));
  assert.ok(localValidationScript.includes('kill -0 "$validation_lock_owner_pid"'));
  assert.ok(localValidationScript.includes("trap release_validation_lock EXIT"));
  assert.doesNotMatch(localValidationScript, /docker (?:image|container) prune/);
});

test("refuses a symlinked validation lock without deleting its target", () => {
  const temporaryValidationLockTestDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-validation-lock-policy-")
  );
  const validationLockParentDirectory = resolve(
    temporaryValidationLockTestDirectory,
    "everforest-local-validation"
  );
  const outsideLockTargetDirectory = resolve(temporaryValidationLockTestDirectory, "outside");
  const validationLockStubCommandDirectory = resolve(temporaryValidationLockTestDirectory, "bin");
  const gitCommonDirectory = realpathSync(
    resolve(
      repositoryDirectory,
      execFileSync("git", ["rev-parse", "--git-common-dir"], {
        cwd: repositoryDirectory,
        encoding: "utf8",
      }).trim()
    )
  );
  const commonRepositoryLockFingerprint = createHash("sha256")
    .update(gitCommonDirectory)
    .digest("hex");
  const validationLockPath = resolve(
    validationLockParentDirectory,
    `${commonRepositoryLockFingerprint}.lock`
  );
  const outsidePidSentinelPath = resolve(outsideLockTargetDirectory, "pid");

  mkdirSync(validationLockParentDirectory, { recursive: true });
  mkdirSync(outsideLockTargetDirectory);
  mkdirSync(validationLockStubCommandDirectory);
  writeFileSync(outsidePidSentinelPath, "999999999\n");
  writeFileSync(resolve(outsideLockTargetDirectory, "common-directory"), `${gitCommonDirectory}\n`);
  writeFileSync(resolve(outsideLockTargetDirectory, "worktree"), `${repositoryDirectory}\n`);
  symlinkSync(outsideLockTargetDirectory, validationLockPath, "dir");

  for (const validationCommandName of ["act", "docker", "gitleaks", "node", "npm"]) {
    const validationCommandPath = resolve(
      validationLockStubCommandDirectory,
      validationCommandName
    );
    writeFileSync(validationCommandPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    chmodSync(validationCommandPath, 0o755);
  }

  try {
    const validationRun = spawnSync(
      "/bin/bash",
      [resolve(repositoryDirectory, "scripts/verify-local.sh")],
      {
        cwd: repositoryDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${validationLockStubCommandDirectory}:${process.env.PATH}`,
          TMPDIR: temporaryValidationLockTestDirectory,
        },
      }
    );
    assert.equal(validationRun.status, 75, validationRun.stderr);
    assert.match(validationRun.stderr, /symlinked or changed/);
    assert.ok(existsSync(outsidePidSentinelPath));
  } finally {
    rmSync(temporaryValidationLockTestDirectory, { force: true, recursive: true });
  }
});

test("refuses symlinked validation lock metadata without overwriting its target", () => {
  const temporaryMetadataSymlinkTestDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-validation-metadata-symlink-policy-")
  );
  const validationLockParentDirectory = resolve(
    temporaryMetadataSymlinkTestDirectory,
    "everforest-local-validation"
  );
  const outsideMetadataSentinelPath = resolve(
    temporaryMetadataSymlinkTestDirectory,
    "outside-owner-sentinel"
  );
  const validationCommandStubDirectory = resolve(temporaryMetadataSymlinkTestDirectory, "bin");
  const canonicalGitCommonDirectory = realpathSync(
    resolve(
      repositoryDirectory,
      execFileSync("git", ["rev-parse", "--git-common-dir"], {
        cwd: repositoryDirectory,
        encoding: "utf8",
      }).trim()
    )
  );
  const commonRepositoryLockFingerprint = createHash("sha256")
    .update(canonicalGitCommonDirectory)
    .digest("hex");
  const validationLockPath = resolve(
    validationLockParentDirectory,
    `${commonRepositoryLockFingerprint}.lock`
  );
  const validationLockMetadataPath = resolve(validationLockPath, "owner");
  const originalOutsideMetadataContents = "preserve owner metadata target\n";

  mkdirSync(validationLockPath, { recursive: true });
  mkdirSync(validationCommandStubDirectory);
  writeFileSync(outsideMetadataSentinelPath, originalOutsideMetadataContents);
  symlinkSync(outsideMetadataSentinelPath, validationLockMetadataPath, "file");
  for (const validationCommandName of ["act", "docker", "gitleaks", "node", "npm"]) {
    const validationCommandPath = resolve(validationCommandStubDirectory, validationCommandName);
    writeFileSync(validationCommandPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    chmodSync(validationCommandPath, 0o755);
  }

  try {
    const validationRun = spawnSync(
      "/bin/bash",
      [resolve(repositoryDirectory, "scripts/verify-local.sh")],
      {
        cwd: repositoryDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${validationCommandStubDirectory}:${process.env.PATH}`,
          TMPDIR: temporaryMetadataSymlinkTestDirectory,
        },
      }
    );
    assert.equal(validationRun.status, 75, validationRun.stderr);
    assert.match(validationRun.stderr, /symlinked or changed/);
    assert.equal(lstatSync(validationLockMetadataPath).isSymbolicLink(), true);
    assert.equal(
      readFileSync(outsideMetadataSentinelPath, "utf8"),
      originalOutsideMetadataContents
    );
  } finally {
    rmSync(temporaryMetadataSymlinkTestDirectory, { force: true, recursive: true });
  }
});

test("refuses a replaced validation lock directory without deleting its external sentinel", () => {
  const temporaryReplacementTestDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-validation-lock-replacement-policy-")
  );
  const validationLockParentDirectory = resolve(
    temporaryReplacementTestDirectory,
    "everforest-local-validation"
  );
  const validationLockReplacementBackupDirectory = resolve(
    temporaryReplacementTestDirectory,
    "original-lock-directory"
  );
  const externalLockTargetDirectory = resolve(
    temporaryReplacementTestDirectory,
    "external-lock-target"
  );
  const externalSentinelPath = resolve(externalLockTargetDirectory, "sentinel");
  const validationCommandStubDirectory = resolve(temporaryReplacementTestDirectory, "bin");
  const canonicalGitCommonDirectory = realpathSync(
    resolve(
      repositoryDirectory,
      execFileSync("git", ["rev-parse", "--git-common-dir"], {
        cwd: repositoryDirectory,
        encoding: "utf8",
      }).trim()
    )
  );
  const commonRepositoryLockFingerprint = createHash("sha256")
    .update(canonicalGitCommonDirectory)
    .digest("hex");
  const validationLockPath = resolve(
    validationLockParentDirectory,
    `${commonRepositoryLockFingerprint}.lock`
  );
  const replacementSleepStubPath = resolve(validationCommandStubDirectory, "sleep");
  const originalExternalSentinelContents = "preserve replaced lock target\n";

  mkdirSync(validationLockPath, { recursive: true });
  mkdirSync(externalLockTargetDirectory);
  mkdirSync(validationCommandStubDirectory);
  writeFileSync(externalSentinelPath, originalExternalSentinelContents);
  writeFileSync(
    replacementSleepStubPath,
    `#!/bin/sh
set -eu
mv -- "$VALIDATION_LOCK_PATH" "$VALIDATION_LOCK_REPLACEMENT_BACKUP"
ln -s -- "$VALIDATION_EXTERNAL_TARGET" "$VALIDATION_LOCK_PATH"
`,
    { mode: 0o755 }
  );
  chmodSync(replacementSleepStubPath, 0o755);
  for (const validationCommandName of ["act", "docker", "gitleaks", "node", "npm"]) {
    const validationCommandPath = resolve(validationCommandStubDirectory, validationCommandName);
    writeFileSync(validationCommandPath, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    chmodSync(validationCommandPath, 0o755);
  }

  try {
    const validationRun = spawnSync(
      "/bin/bash",
      [resolve(repositoryDirectory, "scripts/verify-local.sh")],
      {
        cwd: repositoryDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${validationCommandStubDirectory}:${process.env.PATH}`,
          TMPDIR: temporaryReplacementTestDirectory,
          VALIDATION_EXTERNAL_TARGET: externalLockTargetDirectory,
          VALIDATION_LOCK_PATH: validationLockPath,
          VALIDATION_LOCK_REPLACEMENT_BACKUP: validationLockReplacementBackupDirectory,
        },
      }
    );
    assert.equal(validationRun.status, 75, validationRun.stderr);
    assert.match(validationRun.stderr, /symlinked or changed|active or unsafe/);
    assert.equal(lstatSync(validationLockPath).isSymbolicLink(), true);
    assert.equal(readFileSync(externalSentinelPath, "utf8"), originalExternalSentinelContents);
  } finally {
    rmSync(temporaryReplacementTestDirectory, { force: true, recursive: true });
  }
});

test("reclaims a SIGKILL-style partial validation owner after initialization grace", () => {
  const temporaryPartialOwnerTestDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-validation-partial-owner-")
  );
  const validationLockParentDirectory = resolve(
    temporaryPartialOwnerTestDirectory,
    "everforest-local-validation"
  );
  const validationLockDirectory = resolve(
    validationLockParentDirectory,
    `${createHash("sha256")
      .update(
        realpathSync(
          resolve(
            repositoryDirectory,
            execFileSync("git", ["rev-parse", "--git-common-dir"], {
              cwd: repositoryDirectory,
              encoding: "utf8",
            }).trim()
          )
        )
      )
      .digest("hex")}.lock`
  );
  const validationCommandStubDirectory = resolve(temporaryPartialOwnerTestDirectory, "bin");
  const partialMetadataPath = resolve(validationLockDirectory, ".owner.tmp.999999999");
  mkdirSync(validationLockDirectory, { recursive: true });
  mkdirSync(validationCommandStubDirectory);
  writeFileSync(partialMetadataPath, "partial owner metadata\n");

  const validationCommandStubs = {
    act: "#!/bin/sh\nexit 1\n",
    docker: "#!/bin/sh\nexit 0\n",
    gitleaks: "#!/bin/sh\nexit 0\n",
    node: "#!/bin/sh\nif [ \"$1\" = -p ]; then printf '%s\\n' '24.14.0'; fi\n",
    npm: "#!/bin/sh\nexit 0\n",
  };
  for (const [validationCommandName, validationCommandSource] of Object.entries(
    validationCommandStubs
  )) {
    const validationCommandPath = resolve(validationCommandStubDirectory, validationCommandName);
    writeFileSync(validationCommandPath, validationCommandSource, { mode: 0o755 });
    chmodSync(validationCommandPath, 0o755);
  }

  try {
    const validationRun = spawnSync(
      "/bin/bash",
      [resolve(repositoryDirectory, "scripts/verify-local.sh")],
      {
        cwd: repositoryDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${validationCommandStubDirectory}:${process.env.PATH}`,
          TMPDIR: temporaryPartialOwnerTestDirectory,
        },
      }
    );
    assert.equal(validationRun.status, 1, validationRun.stderr);
    assert.equal(existsSync(partialMetadataPath), false);
    assert.equal(existsSync(validationLockDirectory), false);
  } finally {
    rmSync(temporaryPartialOwnerTestDirectory, { force: true, recursive: true });
  }
});

test("does not steal a live partial validation owner", () => {
  const temporaryLiveOwnerTestDirectory = mkdtempSync(
    resolve(tmpdir(), "everforest-validation-live-owner-")
  );
  const validationLockParentDirectory = resolve(
    temporaryLiveOwnerTestDirectory,
    "everforest-local-validation"
  );
  const validationLockDirectory = resolve(
    validationLockParentDirectory,
    `${createHash("sha256")
      .update(
        realpathSync(
          resolve(
            repositoryDirectory,
            execFileSync("git", ["rev-parse", "--git-common-dir"], {
              cwd: repositoryDirectory,
              encoding: "utf8",
            }).trim()
          )
        )
      )
      .digest("hex")}.lock`
  );
  const liveOwnerTemporaryMetadataPath = resolve(
    validationLockDirectory,
    `.owner.tmp.${process.pid}`
  );
  const validationCommandStubDirectory = resolve(temporaryLiveOwnerTestDirectory, "bin");
  mkdirSync(validationLockDirectory, { recursive: true });
  mkdirSync(validationCommandStubDirectory);
  writeFileSync(liveOwnerTemporaryMetadataPath, "live owner\n");

  const validationCommandStubs = {
    act: "#!/bin/sh\nexit 0\n",
    docker: "#!/bin/sh\nexit 0\n",
    gitleaks: "#!/bin/sh\nexit 0\n",
    node: "#!/bin/sh\nif [ \"$1\" = -p ]; then printf '%s\\n' '24.14.0'; fi\n",
    npm: "#!/bin/sh\nexit 0\n",
  };
  for (const [validationCommandName, validationCommandSource] of Object.entries(
    validationCommandStubs
  )) {
    const validationCommandPath = resolve(validationCommandStubDirectory, validationCommandName);
    writeFileSync(validationCommandPath, validationCommandSource, { mode: 0o755 });
    chmodSync(validationCommandPath, 0o755);
  }

  try {
    const validationRun = spawnSync(
      "/bin/bash",
      [resolve(repositoryDirectory, "scripts/verify-local.sh")],
      {
        cwd: repositoryDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${validationCommandStubDirectory}:${process.env.PATH}`,
          TMPDIR: temporaryLiveOwnerTestDirectory,
        },
      }
    );
    assert.equal(validationRun.status, 75, validationRun.stderr);
    assert.match(validationRun.stderr, /initialization is active/);
    assert.ok(existsSync(liveOwnerTemporaryMetadataPath));
    assert.ok(existsSync(validationLockDirectory));
  } finally {
    rmSync(temporaryLiveOwnerTestDirectory, { force: true, recursive: true });
  }
});

test("serializes shared CodeQL installation without replacing usable versions", () => {
  const codeqlInstallerScript = repositoryFile("scripts/install-codeql.sh");

  assert.ok(codeqlInstallerScript.includes("codeql_install_lock_file"));
  assert.ok(codeqlInstallerScript.includes("codeql_install_lock_wait_seconds=120"));
  assert.match(codeqlInstallerScript, /flock --exclusive --wait/);
  assert.match(codeqlInstallerScript, /requires Linux flock/);
  assert.doesNotMatch(codeqlInstallerScript, /kill -0|lock_owner_pid|stale/);
  assert.match(codeqlInstallerScript, /install-\$\{codeql_bundle_version\}\.\"\*/);
  assert.ok(codeqlInstallerScript.includes("remove_orphaned_codeql_staging_directories"));
  assert.ok(codeqlInstallerScript.includes("refusing to replace it"));
  assert.equal(codeqlInstallerScript.includes('rm -rf -- "$versioned_codeql_directory"'), false);
});
