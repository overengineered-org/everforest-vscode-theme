import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { ThemeAppearance, ThemeContrast, ThemePreferences } from "./interface";
import {
  defaultThemePreferences,
  generatedThemeFileName,
  presetThemeFileName,
  presetThemeName,
  serializeTheme,
} from "./theme";

const defaultGeneratedThemesDirectory = resolve(__dirname, "..", "themes");
const themeAppearances: readonly ThemeAppearance[] = ["dark", "light"];
const themeContrasts: readonly ThemeContrast[] = ["soft", "medium", "hard"];

interface GeneratedThemeArtifact {
  fileName: string;
  source: string;
}

export function generatedThemeArtifacts(): GeneratedThemeArtifact[] {
  const configurableThemeArtifacts = themeAppearances.map((appearance) => ({
    fileName: generatedThemeFileName(appearance),
    source: serializeTheme(defaultThemePreferences[appearance]),
  }));
  const presetThemeArtifacts = themeAppearances.flatMap((appearance) =>
    themeContrasts.map((contrast) => {
      const themePreferences: ThemePreferences = {
        ...defaultThemePreferences[appearance],
        contrast,
      };
      return {
        fileName: presetThemeFileName(themePreferences),
        source: serializeTheme(themePreferences, presetThemeName(themePreferences)),
      };
    })
  );

  return [...configurableThemeArtifacts, ...presetThemeArtifacts];
}

function readExistingPathStats(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function ensureGeneratedThemesDirectory(
  generatedThemesDirectory: string,
  verifyOnly: boolean
): void {
  const directoryStats = readExistingPathStats(generatedThemesDirectory);
  if (directoryStats === undefined) {
    if (verifyOnly) {
      throw new Error(`Generated themes directory is missing: ${generatedThemesDirectory}`);
    }
    mkdirSync(generatedThemesDirectory, { recursive: true });
    return;
  }
  if (directoryStats.isSymbolicLink()) {
    throw new Error(`Refusing symlinked generated themes directory: ${generatedThemesDirectory}`);
  }
  if (!directoryStats.isDirectory()) {
    throw new Error(`Generated themes path must be a directory: ${generatedThemesDirectory}`);
  }
}

function assertSafeGeneratedThemeOutput(generatedThemePath: string): void {
  const outputStats = readExistingPathStats(generatedThemePath);
  if (outputStats === undefined) return;
  if (outputStats.isSymbolicLink()) {
    throw new Error(`Refusing symlinked generated theme output: ${generatedThemePath}`);
  }
  if (!outputStats.isFile()) {
    throw new Error(`Generated theme output must be a regular file: ${generatedThemePath}`);
  }
}

function assertNoUnexpectedGeneratedThemes(
  generatedThemesDirectory: string,
  generatedThemeFileNames: ReadonlySet<string>
): void {
  const unexpectedThemeFileNames = readdirSync(generatedThemesDirectory)
    .filter((fileName) => fileName.endsWith(".json") && !generatedThemeFileNames.has(fileName))
    .sort();
  if (unexpectedThemeFileNames.length > 0) {
    throw new Error(`Unexpected generated theme files: ${unexpectedThemeFileNames.join(", ")}`);
  }
}

function stageGeneratedThemeArtifacts(
  generatedThemesDirectory: string,
  generatedThemeArtifactsToStage: readonly GeneratedThemeArtifact[]
): string {
  const stagingDirectory = mkdtempSync(
    join(generatedThemesDirectory, ".everforest-theme-generation-")
  );
  try {
    for (const generatedThemeArtifact of generatedThemeArtifactsToStage) {
      writeFileSync(
        join(stagingDirectory, generatedThemeArtifact.fileName),
        generatedThemeArtifact.source,
        { encoding: "utf8", flag: "wx" }
      );
    }
    return stagingDirectory;
  } catch (error) {
    rmSync(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
}

function commitStagedThemeArtifacts(
  stagingDirectory: string,
  generatedThemesDirectory: string,
  generatedThemeArtifactsToCommit: readonly GeneratedThemeArtifact[]
): void {
  const backupDirectory = join(stagingDirectory, ".previous");
  mkdirSync(backupDirectory);
  const backedUpThemePaths = new Map<string, string>();
  const committedThemePaths: string[] = [];

  try {
    for (const generatedThemeArtifact of generatedThemeArtifactsToCommit) {
      const generatedThemePath = join(generatedThemesDirectory, generatedThemeArtifact.fileName);
      assertSafeGeneratedThemeOutput(generatedThemePath);

      const outputStats = readExistingPathStats(generatedThemePath);
      if (outputStats !== undefined) {
        const backupThemePath = join(backupDirectory, generatedThemeArtifact.fileName);
        renameSync(generatedThemePath, backupThemePath);
        backedUpThemePaths.set(generatedThemePath, backupThemePath);
      }
      renameSync(join(stagingDirectory, generatedThemeArtifact.fileName), generatedThemePath);
      committedThemePaths.push(generatedThemePath);
    }
  } catch (error) {
    for (const generatedThemePath of committedThemePaths.reverse()) {
      rmSync(generatedThemePath, { force: true });
      const backupThemePath = backedUpThemePaths.get(generatedThemePath);
      if (backupThemePath !== undefined) renameSync(backupThemePath, generatedThemePath);
    }
    for (const [generatedThemePath, backupThemePath] of backedUpThemePaths) {
      if (readExistingPathStats(generatedThemePath) === undefined) {
        renameSync(backupThemePath, generatedThemePath);
      }
    }
    throw error;
  }
}

export function generateThemes(generatedThemesDirectory = defaultGeneratedThemesDirectory): void {
  const verifyOnly = process.env.VERIFY_GENERATED_THEMES === "1";
  const artifacts = generatedThemeArtifacts();
  const generatedThemeFileNames = new Set(artifacts.map(({ fileName }) => fileName));

  ensureGeneratedThemesDirectory(generatedThemesDirectory, verifyOnly);
  if (verifyOnly) {
    assertNoUnexpectedGeneratedThemes(generatedThemesDirectory, generatedThemeFileNames);
  }

  for (const generatedThemeArtifact of artifacts) {
    const generatedThemePath = join(generatedThemesDirectory, generatedThemeArtifact.fileName);
    assertSafeGeneratedThemeOutput(generatedThemePath);

    if (verifyOnly) {
      const committedThemeSource = readFileSync(generatedThemePath, "utf8");
      if (committedThemeSource !== generatedThemeArtifact.source) {
        throw new Error(`Generated theme is stale: ${generatedThemePath}`);
      }
      continue;
    }
  }

  if (verifyOnly) return;

  const stagingDirectory = stageGeneratedThemeArtifacts(generatedThemesDirectory, artifacts);
  try {
    commitStagedThemeArtifacts(stagingDirectory, generatedThemesDirectory, artifacts);
  } finally {
    rmSync(stagingDirectory, { force: true, recursive: true });
  }
}

if (require.main === module) generateThemes();
