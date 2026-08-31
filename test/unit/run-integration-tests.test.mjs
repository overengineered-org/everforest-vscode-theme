import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import JSZip from "jszip";
import {
  assertInstalledExtensionIdentity,
  buildWindowsCommandShellArguments,
  buildExtensionHostArguments,
  createBoundedOutputCollector,
  createImmutablePackagedExtensionSnapshot,
  cleanupTestStateDirectory,
  prepareWindowsShellInvocation,
  quoteWindowsShellArgument,
  readPackagedExtensionChecksum,
  readPackagedExtensionIdentity,
  runWithIntegrationDeadline,
  runTrackedCommand,
} from "../../scripts/run-integration-tests.mjs";

const descendantHeartbeatFixturePath = fileURLToPath(
  new URL("../fixtures/descendant-heartbeat-process.mjs", import.meta.url)
);
const integrationRunnerSource = readFileSync(
  new URL("../../scripts/run-integration-tests.mjs", import.meta.url),
  "utf8"
);

function temporaryRunnerTestDirectory() {
  return mkdtempSync(join(tmpdir(), "everforest-integration-runner-"));
}

test("requires a canonical checksum matching the packaged VSIX bytes", () => {
  const testDirectory = temporaryRunnerTestDirectory();
  const sourceVsixPath = join(testDirectory, "source.vsix");
  const sourceVsixBytes = Buffer.from("checksum-backed VSIX bytes");
  const sourceVsixDigest = createHash("sha256").update(sourceVsixBytes).digest("hex");
  writeFileSync(sourceVsixPath, sourceVsixBytes);
  writeFileSync(`${sourceVsixPath}.sha256`, `${sourceVsixDigest}  source.vsix\n`, "utf8");

  try {
    assert.equal(readPackagedExtensionChecksum(sourceVsixPath), sourceVsixDigest);
    writeFileSync(sourceVsixPath, Buffer.from("changed source bytes"));
    assert.throws(() => readPackagedExtensionChecksum(sourceVsixPath), /does not match/);
  } finally {
    rmSync(testDirectory, { force: true, recursive: true });
  }
});

test("copies an exact read-only VSIX snapshot", () => {
  const testDirectory = temporaryRunnerTestDirectory();
  const sourceVsixPath = join(testDirectory, "source.vsix");
  const stateDirectory = join(testDirectory, "state with spaces");
  const sourceVsixBytes = Buffer.from("checksum-backed VSIX bytes");
  const sourceVsixDigest = createHash("sha256").update(sourceVsixBytes).digest("hex");
  writeFileSync(sourceVsixPath, sourceVsixBytes);
  mkdirSync(stateDirectory);

  try {
    const snapshotPath = createImmutablePackagedExtensionSnapshot(
      sourceVsixPath,
      stateDirectory,
      sourceVsixDigest
    );
    assert.ok(existsSync(snapshotPath));
    assert.deepEqual(readFileSync(snapshotPath), sourceVsixBytes);
    assert.equal(statSync(snapshotPath).mode & 0o222, 0);
    writeFileSync(sourceVsixPath, Buffer.from("changed source bytes"));
    assert.deepEqual(readFileSync(snapshotPath), sourceVsixBytes);
  } finally {
    rmSync(testDirectory, { force: true, recursive: true });
  }
});

test("reads installed extension identity and version from VSIX manifest", async () => {
  const testDirectory = temporaryRunnerTestDirectory();
  const archivePath = join(testDirectory, "identity.vsix");
  const archive = new JSZip();
  archive.file(
    "extension/package.json",
    `${JSON.stringify({ name: "everforest-complete", publisher: "overengineered-org", version: "9.8.7" })}\n`
  );
  writeFileSync(archivePath, await archive.generateAsync({ type: "nodebuffer" }));

  try {
    assert.deepEqual(await readPackagedExtensionIdentity(archivePath), {
      extensionIdentifier: "overengineered-org.everforest-complete",
      extensionVersion: "9.8.7",
    });
  } finally {
    rmSync(testDirectory, { force: true, recursive: true });
  }
});

test("requires the exact installed extension identity and version", () => {
  const extensionIdentity = {
    extensionIdentifier: "overengineered-org.everforest-complete",
    extensionVersion: "9.8.7",
  };
  assert.equal(
    assertInstalledExtensionIdentity(
      "other.extension@1.0.0\noverengineered-org.everforest-complete@9.8.7\n",
      extensionIdentity
    ),
    "overengineered-org.everforest-complete@9.8.7"
  );
  assert.throws(
    () =>
      assertInstalledExtensionIdentity(
        "overengineered-org.everforest-complete@9.8.6\n",
        extensionIdentity
      ),
    /was not listed by VS Code/
  );
});

test("keeps extension-host paths as single arguments and quotes Windows paths", () => {
  const extensionHostArguments = buildExtensionHostArguments(
    "C:\\Users\\QA User\\App Data\\user-data",
    "C:\\Users\\QA User\\App Data\\extensions"
  );
  assert.ok(
    extensionHostArguments.includes("--user-data-dir=C:\\Users\\QA User\\App Data\\user-data")
  );
  assert.equal(
    quoteWindowsShellArgument("C:\\Users\\QA User\\App Data\\everforest.vsix"),
    '"C:\\Users\\QA User\\App Data\\everforest.vsix"'
  );
  assert.match(integrationRunnerSource, /windowsVerbatimArguments: true/);
  assert.deepEqual(
    buildWindowsCommandShellArguments(
      '"C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd" "--version"'
    ),
    ["/d", "/s", "/c", '""C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd" "--version""']
  );
});

test("caps retained and mirrored child output with a UTF-8-safe marker", () => {
  const mirroredOutputChunks = [];
  const outputCollector = createBoundedOutputCollector(
    { write: (outputChunk) => mirroredOutputChunks.push(outputChunk) },
    "stdout",
    64
  );
  outputCollector.append("😀".repeat(100));
  outputCollector.append("ignored after truncation");
  const retainedOutput = outputCollector.text();
  const mirroredOutput = mirroredOutputChunks.join("");
  assert.equal(mirroredOutput, retainedOutput);
  assert.ok(Buffer.byteLength(retainedOutput, "utf8") <= 64);
  assert.match(retainedOutput, /stdout truncated after 64 bytes/);
});

test("passes Windows percent-containing paths through environment placeholders", () => {
  const extensionPath = "C:\\Users\\QA User\\100%VAR%\\everforest.vsix";
  const windowsShellInvocation = prepareWindowsShellInvocation(
    "C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd",
    ["--install-extension", extensionPath]
  );
  assert.doesNotMatch(windowsShellInvocation.commandLine, /100%VAR%/);
  assert.ok(Object.values(windowsShellInvocation.environment).includes(extensionPath));
});

test("bounds pre-host setup by the same integration deadline", async () => {
  const integrationDeadlineTimestamp = Date.now() + 50;
  await assert.rejects(
    runWithIntegrationDeadline(
      () => new Promise(() => {}),
      integrationDeadlineTimestamp,
      "VS Code download"
    ),
    /VS Code download exceeded its \d+ms wall-clock deadline/
  );
});

test("cleans the read-only VSIX snapshot during normal teardown", () => {
  const testDirectory = temporaryRunnerTestDirectory();
  const snapshotDirectory = join(testDirectory, "vsix-snapshot");
  mkdirSync(snapshotDirectory);
  writeFileSync(join(snapshotDirectory, "extension.vsix"), "snapshot", {
    encoding: "utf8",
    mode: 0o444,
  });

  const cleanupError = cleanupTestStateDirectory(testDirectory);
  assert.equal(cleanupError, undefined);
  assert.equal(existsSync(testDirectory), false);
});

test("reports snapshot cleanup read failures after removing the state directory", () => {
  const testDirectory = temporaryRunnerTestDirectory();
  writeFileSync(join(testDirectory, "vsix-snapshot"), "not a directory", "utf8");

  const cleanupError = cleanupTestStateDirectory(testDirectory);
  assert.ok(cleanupError instanceof AggregateError);
  assert.equal(existsSync(testDirectory), false);
});

test(
  "kills timed-out POSIX descendants with their Extension Host",
  {
    skip: process.platform === "win32",
  },
  async () => {
    const testDirectory = temporaryRunnerTestDirectory();
    const descendantReadyPath = join(testDirectory, "descendant.ready");
    const descendantHeartbeatPath = join(testDirectory, "descendant.heartbeat");

    try {
      const timeoutAssertion = assert.rejects(
        runTrackedCommand(process.execPath, [descendantHeartbeatFixturePath], {
          commandLabel: "descendant liveness test",
          environment: {
            EVERFOREST_DESCENDANT_HEARTBEAT_PATH: descendantHeartbeatPath,
            EVERFOREST_DESCENDANT_READY_PATH: descendantReadyPath,
          },
          timeoutMilliseconds: 5_000,
        }),
        /descendant liveness test exceeded its \d+ms wall-clock timeout/
      );
      let descendantProcessStarted = false;
      for (let pollAttempt = 0; pollAttempt < 400; pollAttempt += 1) {
        if (existsSync(descendantReadyPath) && existsSync(descendantHeartbeatPath)) {
          descendantProcessStarted = true;
          break;
        }
        await new Promise((resolvePoll) => setTimeout(resolvePoll, 10));
      }
      await timeoutAssertion;
      assert.equal(descendantProcessStarted, true, "descendant fixture did not become ready");
      const heartbeatAfterTermination = readFileSync(descendantHeartbeatPath, "utf8");
      await new Promise((resolveHeartbeatCheck) => setTimeout(resolveHeartbeatCheck, 200));
      assert.equal(readFileSync(descendantHeartbeatPath, "utf8"), heartbeatAfterTermination);
    } finally {
      rmSync(testDirectory, { force: true, recursive: true });
    }
  }
);

test("terminates a hung command at its hard wall-clock timeout", async () => {
  await assert.rejects(
    runTrackedCommand(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], {
      commandLabel: "test Extension Host",
      timeoutMilliseconds: 50,
    }),
    /test Extension Host exceeded its 50ms wall-clock timeout/
  );
});
