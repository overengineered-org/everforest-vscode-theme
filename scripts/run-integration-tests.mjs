import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
} from "@vscode/test-electron";

const repositoryDirectory = resolve(import.meta.dirname, "..");
const defaultHostTimeoutMilliseconds = 180_000;
const maximumChildOutputBytes = 1_048_576;
const activeChildProcesses = new Set();
let windowsShellInvocationSequence = 0;

function positiveIntegerEnvironmentValue(environmentName, fallbackValue) {
  const configuredValue = process.env[environmentName];
  if (configuredValue === undefined) return fallbackValue;
  const parsedValue = Number(configuredValue);
  if (
    !/^\d+$/.test(configuredValue) ||
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1 ||
    parsedValue > 2_147_483_647
  ) {
    throw new Error(`${environmentName} must be a positive integer in milliseconds`);
  }
  return parsedValue;
}

export function remainingIntegrationTimeout(deadlineTimestamp, operationLabel) {
  const remainingTimeoutMilliseconds = deadlineTimestamp - Date.now();
  if (remainingTimeoutMilliseconds < 1) {
    throw new Error(`${operationLabel} exceeded the integration wall-clock deadline`);
  }
  return remainingTimeoutMilliseconds;
}

export function runWithIntegrationDeadline(operationFactory, deadlineTimestamp, operationLabel) {
  const timeoutMilliseconds = remainingIntegrationTimeout(deadlineTimestamp, operationLabel);
  let timeoutHandle;
  const operationPromise = Promise.resolve().then(operationFactory);
  const deadlinePromise = new Promise((resolveOperation, rejectOperation) => {
    timeoutHandle = setTimeout(() => {
      rejectOperation(
        new Error(`${operationLabel} exceeded its ${timeoutMilliseconds}ms wall-clock deadline`)
      );
    }, timeoutMilliseconds);
  });
  return Promise.race([operationPromise, deadlinePromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

function findPackagedExtensionPath() {
  const packagedExtensionDirectory = resolve(repositoryDirectory, "dist");
  const packagedExtensionFileNames = existsSync(packagedExtensionDirectory)
    ? readdirSync(packagedExtensionDirectory).filter((fileName) => fileName.endsWith(".vsix"))
    : [];
  if (packagedExtensionFileNames.length !== 1) {
    throw new Error(
      `Expected exactly one packaged VSIX in ${packagedExtensionDirectory}, found ${packagedExtensionFileNames.length}`
    );
  }
  return resolve(packagedExtensionDirectory, packagedExtensionFileNames[0]);
}

function calculateSha256(fileBytes) {
  return createHash("sha256").update(fileBytes).digest("hex");
}

export function readPackagedExtensionChecksum(packagedExtensionPath) {
  const packagedExtensionChecksumPath = `${packagedExtensionPath}.sha256`;
  let checksumFileBytes;
  try {
    checksumFileBytes = readFileSync(packagedExtensionChecksumPath);
  } catch (checksumReadError) {
    throw new Error(
      `Packaged VSIX checksum is required beside ${basename(packagedExtensionPath)}: ${checksumReadError}`
    );
  }

  const checksumFileContents = checksumFileBytes.toString("utf8");
  const checksumRecord = /^([0-9a-f]{64})  ([^\r\n]+)\n$/.exec(checksumFileContents);
  if (!checksumRecord || !Buffer.from(checksumFileContents, "utf8").equals(checksumFileBytes)) {
    throw new Error(
      `Packaged VSIX checksum must be exactly one canonical SHA-256 record for ${basename(packagedExtensionPath)}`
    );
  }
  const [, declaredDigest, declaredFileName] = checksumRecord;
  if (declaredFileName !== basename(packagedExtensionPath)) {
    throw new Error(
      `Packaged VSIX checksum names ${declaredFileName}; expected ${basename(packagedExtensionPath)}`
    );
  }

  const packagedExtensionDigest = calculateSha256(readFileSync(packagedExtensionPath));
  if (declaredDigest !== packagedExtensionDigest) {
    throw new Error(
      `Packaged VSIX checksum ${declaredDigest} does not match ${basename(packagedExtensionPath)} bytes (${packagedExtensionDigest})`
    );
  }
  return declaredDigest;
}

export function createImmutablePackagedExtensionSnapshot(
  packagedExtensionPath,
  temporaryStateDirectory,
  expectedDigest
) {
  const snapshotDirectory = resolve(temporaryStateDirectory, "vsix-snapshot");
  mkdirSync(snapshotDirectory, { recursive: true });
  const snapshotPath = resolve(snapshotDirectory, basename(packagedExtensionPath));
  const packagedExtensionBytes = readFileSync(packagedExtensionPath);
  const packagedExtensionDigest = calculateSha256(packagedExtensionBytes);
  if (packagedExtensionDigest !== expectedDigest) {
    throw new Error(
      `Packaged VSIX changed while creating its immutable snapshot (${packagedExtensionDigest})`
    );
  }
  writeFileSync(snapshotPath, packagedExtensionBytes, { mode: 0o444, flag: "wx" });
  chmodSync(snapshotPath, 0o444);
  const snapshotDigest = calculateSha256(readFileSync(snapshotPath));
  if (snapshotDigest !== expectedDigest) {
    throw new Error(
      `Immutable VSIX snapshot checksum ${snapshotDigest} does not match ${expectedDigest}`
    );
  }
  return snapshotPath;
}

export async function readPackagedExtensionIdentity(packagedExtensionPath) {
  let extensionArchive;
  try {
    extensionArchive = await JSZip.loadAsync(readFileSync(packagedExtensionPath), {
      checkCRC32: true,
    });
  } catch (archiveError) {
    throw new Error(
      `Could not read packaged VSIX ${basename(packagedExtensionPath)}: ${archiveError}`
    );
  }
  const manifestEntry = extensionArchive.file("extension/package.json");
  if (!manifestEntry) {
    throw new Error(
      `Packaged VSIX ${basename(packagedExtensionPath)} is missing extension/package.json`
    );
  }
  let extensionManifest;
  try {
    extensionManifest = JSON.parse(await manifestEntry.async("string"));
  } catch (manifestError) {
    throw new Error(`Packaged VSIX has invalid extension/package.json: ${manifestError}`);
  }
  const extensionName = extensionManifest.name;
  const extensionPublisher = extensionManifest.publisher;
  const extensionVersion = extensionManifest.version;
  if (
    typeof extensionName !== "string" ||
    typeof extensionPublisher !== "string" ||
    typeof extensionVersion !== "string" ||
    !extensionName ||
    !extensionPublisher ||
    !extensionVersion
  ) {
    throw new Error(
      "Packaged VSIX extension/package.json must define name, publisher, and version"
    );
  }
  return Object.freeze({
    extensionIdentifier: `${extensionPublisher}.${extensionName}`,
    extensionVersion,
  });
}

export function quoteWindowsShellArgument(argument) {
  const argumentText = String(argument);
  return `"${argumentText.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
}

function safeUtf8Prefix(outputBytes, maximumBytes) {
  if (outputBytes.length <= maximumBytes) return outputBytes;
  let prefixLength = maximumBytes;
  while (prefixLength > 0 && (outputBytes[prefixLength] & 0xc0) === 0x80) {
    prefixLength -= 1;
  }
  return outputBytes.subarray(0, prefixLength);
}

export function createBoundedOutputCollector(
  outputStream,
  outputLabel,
  maximumOutputBytes = maximumChildOutputBytes
) {
  const truncationMarker = `\n[${outputLabel} truncated after ${maximumOutputBytes} bytes]\n`;
  const truncationMarkerBytes = Buffer.byteLength(truncationMarker, "utf8");
  const retainedOutputChunks = [];
  let retainedOutputBytes = 0;
  let outputWasTruncated = false;

  return {
    append(outputChunk) {
      if (outputWasTruncated) return;
      const outputBytes = Buffer.isBuffer(outputChunk)
        ? outputChunk
        : Buffer.from(String(outputChunk), "utf8");
      const remainingOutputBytes = maximumOutputBytes - retainedOutputBytes;
      if (outputBytes.length <= remainingOutputBytes) {
        const outputText = outputBytes.toString("utf8");
        retainedOutputChunks.push(outputText);
        retainedOutputBytes += outputBytes.length;
        outputStream.write(outputText);
        return;
      }

      const outputPayloadMaximumBytes = Math.max(0, remainingOutputBytes - truncationMarkerBytes);
      const outputPayload = safeUtf8Prefix(outputBytes, outputPayloadMaximumBytes).toString("utf8");
      const remainingMarkerBytes = Math.max(
        0,
        remainingOutputBytes - Buffer.byteLength(outputPayload, "utf8")
      );
      const boundedOutputText = `${outputPayload}${safeUtf8Prefix(
        Buffer.from(truncationMarker, "utf8"),
        remainingMarkerBytes
      ).toString("utf8")}`;
      retainedOutputChunks.push(boundedOutputText);
      retainedOutputBytes += Buffer.byteLength(boundedOutputText, "utf8");
      outputWasTruncated = true;
      outputStream.write(boundedOutputText);
    },
    text() {
      return retainedOutputChunks.join("");
    },
  };
}

export function prepareWindowsShellInvocation(command, commandArguments, environment = {}) {
  const invocationId = ++windowsShellInvocationSequence;
  const commandEnvironment = { ...environment };
  const commandLineArguments = [command, ...commandArguments].map(
    (commandArgument, argumentIndex) => {
      const environmentName = `EVERFOREST_COMMAND_ARG_${process.pid}_${invocationId}_${argumentIndex}`;
      commandEnvironment[environmentName] = String(commandArgument);
      return `%${environmentName}%`;
    }
  );
  return {
    commandLine: commandLineArguments.map(quoteWindowsShellArgument).join(" "),
    environment: commandEnvironment,
  };
}

function spawnTrackedCommand(command, commandArguments, spawnOptions = {}) {
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command)) {
    const windowsShellInvocation = prepareWindowsShellInvocation(
      command,
      commandArguments,
      spawnOptions.env
    );
    return spawn(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", windowsShellInvocation.commandLine],
      {
        ...spawnOptions,
        env: windowsShellInvocation.environment,
        shell: false,
      }
    );
  }
  return spawn(command, commandArguments, {
    ...spawnOptions,
    detached: process.platform !== "win32",
    shell: false,
  });
}

async function terminateChildProcess(childProcess) {
  if (!childProcess.pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-childProcess.pid, "SIGKILL");
    } catch {
      try {
        childProcess.kill("SIGKILL");
      } catch {
        // The process may have exited at the termination boundary.
      }
    }
    return;
  }
  const taskkillExecutable = process.env.WINDIR
    ? resolve(process.env.WINDIR, "System32", "taskkill.exe")
    : "taskkill.exe";
  await new Promise((resolveTermination, rejectTermination) => {
    const taskkillProcess = spawn(
      taskkillExecutable,
      ["/F", "/T", "/PID", String(childProcess.pid)],
      { stdio: "ignore", windowsHide: true }
    );
    taskkillProcess.once("error", rejectTermination);
    taskkillProcess.once("close", (exitCode, terminationSignal) => {
      if (exitCode === 0) {
        resolveTermination();
      } else {
        rejectTermination(
          new Error(`taskkill failed with exit code ${exitCode ?? terminationSignal}`)
        );
      }
    });
  });
}

export function runTrackedCommand(
  command,
  commandArguments,
  { commandLabel = command, timeoutMilliseconds, environment = {} } = {}
) {
  const childProcess = spawnTrackedCommand(command, commandArguments, {
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  activeChildProcesses.add(childProcess);
  let timeoutHandle;
  let timeoutTriggered = false;
  return new Promise((resolveCommand, rejectCommand) => {
    let settled = false;
    const settle = (error, commandResult) => {
      if (settled) return;
      settled = true;
      activeChildProcesses.delete(childProcess);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (error) rejectCommand(error);
      else resolveCommand(commandResult);
    };
    const stdoutCollector = createBoundedOutputCollector(process.stdout, "stdout");
    const stderrCollector = createBoundedOutputCollector(process.stderr, "stderr");
    childProcess.stdout?.setEncoding("utf8").on("data", (chunk) => stdoutCollector.append(chunk));
    childProcess.stderr?.setEncoding("utf8").on("data", (chunk) => stderrCollector.append(chunk));
    childProcess.once("error", (childProcessError) => {
      if (timeoutTriggered) return;
      settle(childProcessError);
    });
    childProcess.once("close", (exitCode, terminationSignal) => {
      if (timeoutTriggered) return;
      if (exitCode !== 0) {
        settle(
          new Error(
            `${commandLabel} failed with exit code ${exitCode ?? terminationSignal}:\n${stderrCollector.text()}\n${stdoutCollector.text()}`
          )
        );
        return;
      }
      settle(undefined, { stdout: stdoutCollector.text(), stderr: stderrCollector.text() });
    });
    if (timeoutMilliseconds !== undefined) {
      timeoutHandle = setTimeout(() => {
        timeoutTriggered = true;
        const timeoutError = new Error(
          `${commandLabel} exceeded its ${timeoutMilliseconds}ms wall-clock timeout`
        );
        terminateChildProcess(childProcess)
          .catch((killError) => {
            try {
              childProcess.kill("SIGKILL");
            } catch {
              // The process may have exited at the termination boundary.
            }
            console.error(`Could not terminate ${commandLabel}: ${killError}`);
          })
          .finally(() => settle(timeoutError));
      }, timeoutMilliseconds);
      timeoutHandle.unref?.();
    }
  });
}

export function buildExtensionHostArguments(userDataDirectory, extensionsDirectory) {
  return [
    resolve(repositoryDirectory, "fixtures"),
    `--user-data-dir=${userDataDirectory}`,
    `--extensions-dir=${extensionsDirectory}`,
    "--disable-crash-reporter",
    "--disable-telemetry",
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--disable-updates",
    "--skip-welcome",
    "--skip-release-notes",
    "--no-cached-data",
    "--disable-workspace-trust",
    `--extensionTestsPath=${resolve(repositoryDirectory, "test", "integration", "index.js")}`,
    `--extensionDevelopmentPath=${resolve(repositoryDirectory, "test", "harness")}`,
  ];
}

export function assertInstalledExtensionIdentity(commandOutput, extensionIdentity) {
  const expectedInstalledRecord = `${extensionIdentity.extensionIdentifier}@${extensionIdentity.extensionVersion}`;
  const installedRecords = new Set(
    commandOutput
      .split(/\r?\n/)
      .map((outputLine) => outputLine.trim())
      .filter(Boolean)
  );
  if (!installedRecords.has(expectedInstalledRecord)) {
    throw new Error(
      `Installed VSIX identity ${expectedInstalledRecord} was not listed by VS Code:\n${commandOutput}`
    );
  }
  return expectedInstalledRecord;
}

function runExtensionHost(
  vscodeExecutablePath,
  integrationTestMode,
  userDataDirectory,
  extensionsDirectory,
  hostTimeoutMilliseconds
) {
  const extensionHostArguments = buildExtensionHostArguments(
    userDataDirectory,
    extensionsDirectory
  );
  return runTrackedCommand(vscodeExecutablePath, extensionHostArguments, {
    commandLabel: `VS Code ${integrationTestMode} Extension Host`,
    environment: { EVERFOREST_INTEGRATION_TEST_MODE: integrationTestMode },
    timeoutMilliseconds: hostTimeoutMilliseconds,
  });
}

async function runVSCodeCliCommand(
  vscodeExecutablePath,
  commandArguments,
  commandLabel,
  timeoutMilliseconds
) {
  const [cliExecutablePath, ...cliProfileArguments] = resolveCliArgsFromVSCodeExecutablePath(
    vscodeExecutablePath,
    { reuseMachineInstall: true }
  );
  return runTrackedCommand(cliExecutablePath, [...cliProfileArguments, ...commandArguments], {
    commandLabel,
    timeoutMilliseconds,
  });
}

export function cleanupTestStateDirectory(testStateDirectory) {
  const cleanupErrors = [];
  try {
    const snapshotDirectory = resolve(testStateDirectory, "vsix-snapshot");
    if (existsSync(snapshotDirectory)) {
      for (const snapshotFileName of readdirSync(snapshotDirectory)) {
        try {
          chmodSync(resolve(snapshotDirectory, snapshotFileName), 0o600);
        } catch (chmodError) {
          cleanupErrors.push(chmodError);
        }
      }
    }
  } catch (snapshotCleanupError) {
    cleanupErrors.push(snapshotCleanupError);
  }
  try {
    rmSync(testStateDirectory, { recursive: true, force: true });
  } catch (cleanupError) {
    cleanupErrors.push(cleanupError);
  }
  return cleanupErrors.length > 0
    ? new AggregateError(
        cleanupErrors,
        `Could not clean integration test state ${testStateDirectory}`
      )
    : undefined;
}

async function terminateActiveChildProcesses() {
  const terminationResults = await Promise.allSettled(
    [...activeChildProcesses].map(terminateChildProcess)
  );
  for (const terminationResult of terminationResults) {
    if (terminationResult.status === "rejected") {
      console.error(
        `Could not terminate an integration child process: ${terminationResult.reason}`
      );
    }
  }
}

function registerTerminationHandlers(testStateDirectory) {
  const terminationSignals = ["SIGHUP", "SIGINT", "SIGTERM"];
  const handlers = new Map();
  let terminationStarted = false;
  for (const terminationSignal of terminationSignals) {
    const handler = () => {
      if (terminationStarted) return;
      terminationStarted = true;
      void terminateActiveChildProcesses().finally(() => {
        const cleanupError = cleanupTestStateDirectory(testStateDirectory);
        if (cleanupError) console.error(cleanupError);
        process.exitCode = terminationSignal === "SIGINT" ? 130 : 143;
        process.exit();
      });
    };
    handlers.set(terminationSignal, handler);
    process.once(terminationSignal, handler);
  }
  return () => {
    for (const [terminationSignal, handler] of handlers) {
      process.removeListener(terminationSignal, handler);
    }
  };
}

async function runIntegrationTests() {
  const hostTimeoutMilliseconds = positiveIntegerEnvironmentValue(
    "EVERFOREST_INTEGRATION_HOST_TIMEOUT_MS",
    defaultHostTimeoutMilliseconds
  );
  const integrationDeadlineTimestamp = Date.now() + hostTimeoutMilliseconds;
  const packagedExtensionPath = findPackagedExtensionPath();
  const packagedExtensionDigest = readPackagedExtensionChecksum(packagedExtensionPath);
  const packagedExtensionIdentity = await readPackagedExtensionIdentity(packagedExtensionPath);
  const vscodeVersion = process.env.EVERFOREST_VSCODE_VERSION ?? "stable";
  const temporaryFilesDirectory = process.platform === "darwin" ? "/tmp" : tmpdir();
  const vscodeTestStateDirectory = mkdtempSync(resolve(temporaryFilesDirectory, "evf-"));
  const isolatedExtensionsDirectory = resolve(vscodeTestStateDirectory, "extensions");
  const isolatedUserDataDirectory = resolve(vscodeTestStateDirectory, "user-data");
  const unregisterTerminationHandlers = registerTerminationHandlers(vscodeTestStateDirectory);

  let integrationError;
  try {
    const immutablePackagedExtensionPath = createImmutablePackagedExtensionSnapshot(
      packagedExtensionPath,
      vscodeTestStateDirectory,
      packagedExtensionDigest
    );
    const vscodeExecutablePath = await runWithIntegrationDeadline(
      () =>
        downloadAndUnzipVSCode({
          version: vscodeVersion,
          timeout: remainingIntegrationTimeout(integrationDeadlineTimestamp, "VS Code download"),
        }),
      integrationDeadlineTimestamp,
      "VS Code download"
    );
    await runVSCodeCliCommand(
      vscodeExecutablePath,
      [
        "--install-extension",
        immutablePackagedExtensionPath,
        "--force",
        `--extensions-dir=${isolatedExtensionsDirectory}`,
        `--user-data-dir=${isolatedUserDataDirectory}`,
      ],
      "VS Code extension installation",
      remainingIntegrationTimeout(integrationDeadlineTimestamp, "VS Code extension installation")
    );
    const installedExtensionList = await runVSCodeCliCommand(
      vscodeExecutablePath,
      [
        "--list-extensions",
        "--show-versions",
        `--extensions-dir=${isolatedExtensionsDirectory}`,
        `--user-data-dir=${isolatedUserDataDirectory}`,
      ],
      "VS Code installed-extension identity check",
      remainingIntegrationTimeout(
        integrationDeadlineTimestamp,
        "VS Code installed-extension identity check"
      )
    );
    assertInstalledExtensionIdentity(installedExtensionList.stdout, packagedExtensionIdentity);
    writeSystemThemeSettings(isolatedUserDataDirectory, true);
    await runExtensionHost(
      vscodeExecutablePath,
      "auto-mode",
      isolatedUserDataDirectory,
      isolatedExtensionsDirectory,
      remainingIntegrationTimeout(integrationDeadlineTimestamp, "VS Code auto-mode Extension Host")
    );
    writeSystemThemeSettings(isolatedUserDataDirectory, false);
    await runExtensionHost(
      vscodeExecutablePath,
      "manual-themes",
      isolatedUserDataDirectory,
      isolatedExtensionsDirectory,
      remainingIntegrationTimeout(
        integrationDeadlineTimestamp,
        "VS Code manual-themes Extension Host"
      )
    );
  } catch (workflowError) {
    integrationError = workflowError;
  }
  let cleanupError;
  try {
    cleanupError = cleanupTestStateDirectory(vscodeTestStateDirectory);
  } finally {
    unregisterTerminationHandlers();
  }
  if (integrationError) {
    if (cleanupError) console.error(cleanupError);
    throw integrationError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
}

function writeSystemThemeSettings(userDataDirectory, autoDetectColorScheme) {
  const userSettingsDirectory = resolve(userDataDirectory, "User");
  mkdirSync(userSettingsDirectory, { recursive: true });
  // The Start here flow selects Dark before users enable automatic switching.
  writeFileSync(
    resolve(userSettingsDirectory, "settings.json"),
    `${JSON.stringify(
      {
        "chat.disableAIFeatures": true,
        "extensions.autoCheckUpdates": false,
        "extensions.autoUpdate": false,
        "window.autoDetectColorScheme": autoDetectColorScheme,
        "workbench.colorTheme": "Everforest Complete Dark",
        "workbench.preferredDarkColorTheme": "Everforest Complete Dark",
        "workbench.preferredLightColorTheme": "Everforest Complete Light",
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runIntegrationTests().catch((integrationError) => {
    console.error(integrationError);
    process.exitCode = 1;
  });
}
