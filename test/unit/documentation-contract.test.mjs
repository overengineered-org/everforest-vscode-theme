import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { load as parseYaml } from "js-yaml";

const repositoryDirectory = resolve(import.meta.dirname, "../..");
const extensionManifest = JSON.parse(
  readFileSync(resolve(repositoryDirectory, "package.json"), "utf8")
);
const readmePath = resolve(repositoryDirectory, "README.md");
const readme = readFileSync(readmePath, "utf8");
const designDocumentation = readFileSync(resolve(repositoryDirectory, "DESIGN.md"), "utf8");
const productRegister = readFileSync(resolve(repositoryDirectory, "PRODUCT.md"), "utf8");
const supportDocumentation = readFileSync(resolve(repositoryDirectory, "SUPPORT.md"), "utf8");
const architectureDocumentation = readFileSync(
  resolve(repositoryDirectory, "docs/ARCHITECTURE.md"),
  "utf8"
);
const scheduleSource = readFileSync(resolve(repositoryDirectory, "src/schedule.ts"), "utf8");
const themeFileTransactionSource = readFileSync(
  resolve(repositoryDirectory, "src/theme-file-transaction.ts"),
  "utf8"
);
const visualTestingDocumentation = readFileSync(
  resolve(repositoryDirectory, "docs/VISUAL_TESTING.md"),
  "utf8"
);
const documentedWorkbenchColorContract = JSON.parse(
  readFileSync(
    resolve(repositoryDirectory, "src/workbench/documented-workbench-colors.json"),
    "utf8"
  )
);
const workbenchColorSource = readFileSync(
  resolve(repositoryDirectory, "src/workbench/colors.ts"),
  "utf8"
);
const configurationSource = readFileSync(
  resolve(repositoryDirectory, "src/configuration.ts"),
  "utf8"
);

function collectRepositoryMarkdownPaths(repositoryPath) {
  const markdownPaths = [];
  for (const directoryEntry of readdirSync(repositoryPath, { withFileTypes: true })) {
    if ([".git", ".vscode-test", "dist", "node_modules"].includes(directoryEntry.name)) continue;
    const entryPath = resolve(repositoryPath, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      markdownPaths.push(...collectRepositoryMarkdownPaths(entryPath));
    } else if (directoryEntry.isFile() && directoryEntry.name.endsWith(".md")) {
      markdownPaths.push(entryPath);
    }
  }
  return markdownPaths.sort();
}

const markdownPaths = collectRepositoryMarkdownPaths(repositoryDirectory);

function extractMarkdownTargets(markdownSource) {
  const markdownTargets = [];
  const inlineLinkPattern = /!?\[[^\]]*\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+[^)\n]*)?\)/g;
  const referenceLinkPattern = /^\s{0,3}\[[^\]]+\]:\s*(<[^>\n]*>|[^\s]+)/gm;

  for (const markdownMatch of markdownSource.matchAll(inlineLinkPattern)) {
    markdownTargets.push(markdownMatch[1]);
  }
  for (const markdownMatch of markdownSource.matchAll(referenceLinkPattern)) {
    markdownTargets.push(markdownMatch[1]);
  }
  return markdownTargets;
}

function localMarkdownTargetPath(markdownTarget) {
  let normalizedTarget = markdownTarget.trim();
  if (normalizedTarget.startsWith("<") && normalizedTarget.endsWith(">")) {
    normalizedTarget = normalizedTarget.slice(1, -1);
  }
  if (
    normalizedTarget.length === 0 ||
    normalizedTarget.startsWith("#") ||
    normalizedTarget.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(normalizedTarget)
  ) {
    return undefined;
  }

  const targetWithoutFragment = normalizedTarget.split(/[?#]/, 1)[0];
  if (!targetWithoutFragment) return undefined;
  return decodeURIComponent(targetWithoutFragment);
}

function extractExtensionContributedColorIdentifiers(sourceText) {
  const sourceLines = sourceText.split("\n");
  const extensionColorSectionMarker = /^\s*\/\/ Extension-contributed colors:/;
  const colorPropertyLinePattern = /^\s*"([^"]+)":/;
  const extensionColorIdentifiers = [];

  for (let sourceLineIndex = 0; sourceLineIndex < sourceLines.length; sourceLineIndex += 1) {
    if (!extensionColorSectionMarker.test(sourceLines[sourceLineIndex])) continue;

    let expectedColorNamespace;
    for (
      let colorLineIndex = sourceLineIndex + 1;
      colorLineIndex < sourceLines.length;
      colorLineIndex += 1
    ) {
      const colorPropertyMatch = colorPropertyLinePattern.exec(sourceLines[colorLineIndex]);
      if (!colorPropertyMatch) break;
      const [colorNamespace] = colorPropertyMatch[1].split(".");
      if (!expectedColorNamespace) expectedColorNamespace = colorNamespace;
      if (colorNamespace !== expectedColorNamespace) break;
      extensionColorIdentifiers.push(colorPropertyMatch[1]);
    }
  }
  return extensionColorIdentifiers;
}

function sourcePathForRuntimeEntry(runtimeEntryPath) {
  return runtimeEntryPath.replace(/^\.\/dist\//, "src/").replace(/\.js$/, ".ts");
}

function collectRuntimeSourcePaths(runtimeEntrySourcePath) {
  const pendingSourcePaths = [resolve(repositoryDirectory, runtimeEntrySourcePath)];
  const visitedSourcePaths = new Set();

  while (pendingSourcePaths.length > 0) {
    const sourcePath = pendingSourcePaths.pop();
    if (!sourcePath || visitedSourcePaths.has(sourcePath)) continue;
    visitedSourcePaths.add(sourcePath);
    const sourceText = readFileSync(sourcePath, "utf8");
    for (const importMatch of sourceText.matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const importedSourcePath = resolve(dirname(sourcePath), importMatch[1]);
      const typescriptSourcePath = `${importedSourcePath}.ts`;
      if (existsSync(typescriptSourcePath)) pendingSourcePaths.push(typescriptSourcePath);
    }
  }
  return [...visitedSourcePaths];
}

function packageGlobMatchesPath(packageGlob, packagePath) {
  const wildcardIndex = packageGlob.indexOf("*");
  if (wildcardIndex === -1) return packageGlob === packagePath;
  return (
    packagePath.startsWith(packageGlob.slice(0, wildcardIndex)) &&
    packagePath.endsWith(packageGlob.slice(wildcardIndex + 1))
  );
}

function documentationSectionContents(markdownSource) {
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  const headings = [...markdownSource.matchAll(headingPattern)];
  return headings.map((headingMatch, headingIndex) => ({
    title: headingMatch[2].trim(),
    contents: markdownSource.slice(
      headingMatch.index + headingMatch[0].length,
      headings[headingIndex + 1]?.index ?? markdownSource.length
    ),
  }));
}

test("resolves every local Markdown link and image", () => {
  for (const markdownPath of markdownPaths) {
    const markdownSource = readFileSync(markdownPath, "utf8");
    for (const markdownTarget of extractMarkdownTargets(markdownSource)) {
      const localTarget = localMarkdownTargetPath(markdownTarget);
      if (!localTarget) continue;

      const resolvedTargetPath = resolve(dirname(markdownPath), localTarget);
      assert.ok(
        existsSync(resolvedTargetPath),
        `${relative(repositoryDirectory, markdownPath)} links to missing ${localTarget}`
      );
    }
  }
});

test("keeps README command instructions aligned with contributed commands", () => {
  const readmeCommandIdentifiers = [...readme.matchAll(/\]\(\s*command:([^)\s?#]+)/g)].map(
    (commandMatch) => commandMatch[1]
  );
  assert.deepEqual(readmeCommandIdentifiers, [], "Marketplace README must not use command: URIs");
  for (const contributedCommand of extensionManifest.contributes.commands) {
    const commandPaletteLabel = `${contributedCommand.category}: ${contributedCommand.title}`;
    assert.ok(
      readme.includes(`**${commandPaletteLabel}**`),
      `README must name ${contributedCommand.command}`
    );
  }
});

test("documents every contributed theme and exactly the public settings", () => {
  const contributedThemeLabels = extensionManifest.contributes.themes.map(({ label }) => label);
  const publicConfigurationProperties = extensionManifest.contributes.configuration.flatMap(
    ({ properties }) => Object.keys(properties)
  );
  const documentedConfigurationProperties = [
    ...readme.matchAll(/`(everforestComplete\.[A-Za-z0-9_.-]+)`/g),
  ].map((configurationMatch) => configurationMatch[1]);

  assert.equal(contributedThemeLabels.length, 8);
  assert.equal(new Set(contributedThemeLabels).size, contributedThemeLabels.length);
  for (const contributedThemeLabel of contributedThemeLabels) {
    assert.ok(readme.includes(contributedThemeLabel), `README omits ${contributedThemeLabel}`);
  }

  assert.equal(publicConfigurationProperties.length, 14);
  assert.equal(
    new Set(documentedConfigurationProperties).size,
    publicConfigurationProperties.length,
    "README must enumerate exactly the manifest's public Everforest properties"
  );
  assert.deepEqual(
    [...new Set(documentedConfigurationProperties)].sort(),
    [...publicConfigurationProperties].sort()
  );
});

test("keeps privacy and Desktop/browser claims within runtime boundaries", () => {
  const desktopRuntimeSource = readFileSync(
    resolve(repositoryDirectory, sourcePathForRuntimeEntry(extensionManifest.main)),
    "utf8"
  );
  const browserRuntimeSource = collectRuntimeSourcePaths(
    sourcePathForRuntimeEntry(extensionManifest.browser)
  )
    .map((sourcePath) => readFileSync(sourcePath, "utf8"))
    .join("\n");
  const allRuntimeSource = `${desktopRuntimeSource}\n${browserRuntimeSource}\n${configurationSource}`;
  const publicConfigurationSchemas = extensionManifest.contributes.configuration.flatMap(
    ({ properties }) => Object.values(properties)
  );
  const nativeConfigurationSections = [
    ...configurationSource.matchAll(/nativeConfigurationUpdate\("([^"]+)"/g),
  ].map((configurationMatch) => configurationMatch[1]);

  assert.equal(extensionManifest.main, "./dist/extension.js");
  assert.equal(extensionManifest.browser, "./dist/extension-web.js");
  assert.ok(publicConfigurationSchemas.every(({ scope }) => scope === "application"));
  assert.match(readme, /application-scoped \(global\)/i);
  assert.match(readme, /cannot be set per workspace/i);
  assert.match(
    readme,
    /may inspect VS Code workspace\/folder configuration values[\s\S]{0,100}guard its global-only writes/i
  );
  assert.doesNotMatch(readme, /repository data are read/i);
  assert.doesNotMatch(productRegister, /runtime access to workspace data/i);
  assert.match(
    readme,
    /Guided setup commits after its third choice[\s\S]{0,180}Advanced Controls stage changes until Apply/i
  );
  assert.match(
    readme,
    /Automatic Light\/Dark is separate[\s\S]{0,320}without regenerating theme files or offering a[\s\S]{0,20}reload prompt/i
  );
  assert.match(readme, /global[\s\S]{0,80}`window\.autoDetectColorScheme`/i);
  assert.match(readme, /`workbench` theme settings/i);

  assert.match(readme, /^### VS Code Desktop$/m);
  assert.match(readme, /^### Browser-hosted VS Code$/m);
  assert.match(
    readme,
    /VS Code Desktop supports configurable-theme regeneration[\s\S]{0,80}automatic switching/i
  );
  assert.match(
    readme,
    /browser fallback does not regenerate theme files or run automatic scheduling/i
  );
  assert.match(desktopRuntimeSource, /replaceConfiguredThemeFiles/);
  assert.match(themeFileTransactionSource, /node:fs\/promises/);
  assert.match(themeFileTransactionSource, /writeDurableFile/);
  assert.match(desktopRuntimeSource, /extensionContext\.extensionPath/);
  assert.match(desktopRuntimeSource, /ThemeScheduleController/);
  assert.doesNotMatch(browserRuntimeSource, /node:fs\/promises/);
  assert.doesNotMatch(browserRuntimeSource, /(?:readFile|writeFile|ThemeScheduleController)/);
  assert.match(browserRuntimeSource, /configuration controls require VS Code Desktop/i);

  assert.match(desktopRuntimeSource, /ConfigurationTarget\.Global/);
  assert.doesNotMatch(desktopRuntimeSource, /ConfigurationTarget\.(?:Workspace|WorkspaceFolder)/);
  assert.match(configurationSource, /function extensionConfigurationUpdate/);
  assert.match(
    configurationSource,
    /nativeConfigurationUpdate\("window",\s*"autoDetectColorScheme"/
  );
  assert.match(configurationSource, /nativeConfigurationUpdate\("workbench",\s*"colorTheme"/);
  assert.ok(nativeConfigurationSections.includes("window"));
  assert.ok(nativeConfigurationSections.includes("workbench"));
  assert.match(themeFileTransactionSource, /function readBoundedThemeFile/);
  assert.match(themeFileTransactionSource, /function readThemeFilePathState/);
  assert.match(desktopRuntimeSource, /join\(extensionPath, "themes"/);
  assert.doesNotMatch(
    desktopRuntimeSource,
    /workspace\.fs|workspaceFolders|findFiles|openTextDocument/
  );
  assert.doesNotMatch(
    allRuntimeSource,
    /\b(?:fetch|XMLHttpRequest|WebSocket|http\.request|https\.request|sendTelemetryEvent)\s*\(/i
  );

  assert.match(
    designDocumentation,
    /Guided configuration applies three choices[\s\S]{0,180}regeneration check[\s\S]{0,100}at most one reload/i
  );
  assert.match(
    designDocumentation,
    /Automatic Light\/Dark is configured separately[\s\S]{0,120}without regenerating theme files/i
  );
  assert.match(
    productRegister,
    /Guided setup and Advanced Controls regenerate(?: the two configurable)? themes[\s\S]{0,100}Automatic Light\/Dark controls local scheduling/i
  );
  assert.match(
    productRegister,
    /workspace\/folder configuration values may be inspected[\s\S]{0,100}global-only writes/i
  );
  assert.match(
    architectureDocumentation,
    /may inspect workspace\/folder[\s\S]{0,100}guard global-only writes/i
  );
  assert.match(
    architectureDocumentation,
    /Guided setup collects choices[\s\S]{0,320}regeneration check[\s\S]{0,220}Automatic Light\/Dark is separate[\s\S]{0,140}without regenerating theme files/i
  );
  assert.match(
    supportDocumentation,
    /sanitised native `window\.\*`\/`workbench\.\*` settings[\s\S]{0,100}workspace\/folder[\s\S]{0,40}override context/i
  );
  assert.match(
    visualTestingDocumentation,
    /change at least one Contrast or Workbench choice before confirming[\s\S]{0,100}reload prompt/i
  );
  assert.match(readme, /lock, journal, temporary, backup, and[\s\S]{0,180}transaction artifacts/i);
  assert.match(
    architectureDocumentation,
    /Static validation: generated files, 937 workbench\/extension color keys/i
  );
  assert.match(architectureDocumentation, /Extension Host:[\s\S]{0,180}color-theme schema/i);
});

test("references and packages the schedule illustration", () => {
  const walkthroughSteps = extensionManifest.contributes.walkthroughs.flatMap(({ steps }) => steps);
  const scheduleStep = walkthroughSteps.find(({ title, description }) =>
    /automatic|schedule/i.test(`${title} ${description}`)
  );
  assert.ok(scheduleStep?.media?.image, "manifest must define a schedule walkthrough image");

  const scheduleIllustrationPath = scheduleStep.media.image;
  const scheduleIllustrationAbsolutePath = resolve(repositoryDirectory, scheduleIllustrationPath);
  assert.ok(existsSync(scheduleIllustrationAbsolutePath));
  const marketplaceSchedulePreviewPath = "media/previews/everforest-complete-automation.webp";
  assert.ok(existsSync(resolve(repositoryDirectory, marketplaceSchedulePreviewPath)));
  assert.ok(
    extractMarkdownTargets(readme).some(
      (markdownTarget) => localMarkdownTargetPath(markdownTarget) === marketplaceSchedulePreviewPath
    ),
    `README must reference ${marketplaceSchedulePreviewPath}`
  );

  const scheduleIllustrationPackageEntries = extensionManifest.files.filter((packageEntry) =>
    packageGlobMatchesPath(packageEntry, scheduleIllustrationPath)
  );
  assert.deepEqual(scheduleIllustrationPackageEntries, [scheduleIllustrationPath]);
  assert.deepEqual(
    extensionManifest.files.filter((packageEntry) =>
      packageGlobMatchesPath(packageEntry, marketplaceSchedulePreviewPath)
    ),
    [marketplaceSchedulePreviewPath]
  );
});

test("documents daylight-saving schedule boundary behavior", () => {
  assert.match(
    scheduleSource,
    /nonexistent DST times[\s\S]{0,120}requested local wall-clock time is skipped/i
  );
  assert.match(
    scheduleSource,
    /ambiguous fall-back wall-clock time[\s\S]{0,120}earlier[\s\S]{0,20}real occurrence/i
  );
  assert.match(
    readme,
    /spring-forward[\s\S]{0,100}wall-clock time that does not exist is skipped/i
  );
  assert.match(
    readme,
    /fall-back[\s\S]{0,100}repeated wall-clock time uses its earlier real occurrence/i
  );
  assert.match(
    architectureDocumentation,
    /spring-forward[\s\S]{0,100}wall time is skipped[\s\S]{0,100}fall-back[\s\S]{0,100}earlier occurrence/i
  );
});

test("keeps theme-file ownership and icon source documentation grounded", () => {
  const ownedThemeFileResponsibilities = [
    ["src/theme-regeneration.ts", /synchronization and feedback for generated themes/i],
    ["src/theme-file-lock.ts", /serializes generated-theme file writes/i],
    ["src/theme-file-transaction.ts", /atomic replacement and recovery/i],
  ];
  for (const [sourceFilePath, responsibilityPattern] of ownedThemeFileResponsibilities) {
    assert.ok(
      existsSync(resolve(repositoryDirectory, sourceFilePath)),
      `${sourceFilePath} must exist`
    );
    assert.match(
      architectureDocumentation,
      new RegExp("`" + sourceFilePath + "`[\\s\\S]{0,160}" + responsibilityPattern.source, "i"),
      `Architecture must document ${sourceFilePath}`
    );
  }

  const iconRasterBytes = readFileSync(resolve(repositoryDirectory, "media/icon.png"));
  assert.ok(existsSync(resolve(repositoryDirectory, "media/icon.svg")));
  assert.equal(extensionManifest.icon, "media/icon.png");
  assert.ok(extensionManifest.files.includes("media/icon.png"));
  assert.equal(iconRasterBytes.toString("ascii", 12, 16), "IHDR");
  assert.equal(iconRasterBytes.readUInt32BE(16), 512);
  assert.equal(iconRasterBytes.readUInt32BE(20), 512);
  assert.match(
    architectureDocumentation,
    /editable icon source is[\s\S]{0,60}`media\/icon\.svg`[\s\S]{0,180}tested and shipped Marketplace raster is[\s\S]{0,40}`media\/icon\.png`[\s\S]{0,40}at 512px/i
  );
});

test("keeps coverage counts split between documented and extension colors", () => {
  const documentedColorCount = documentedWorkbenchColorContract.identifiers.length;
  const extensionContributedColorIdentifiers =
    extractExtensionContributedColorIdentifiers(workbenchColorSource);
  const extensionContributedColorCount = extensionContributedColorIdentifiers.length;
  const totalMappedColorCount = documentedColorCount + extensionContributedColorCount;
  const coverageDocumentationPaths = [
    readmePath,
    resolve(repositoryDirectory, "docs/ARCHITECTURE.md"),
  ];
  const coverageClaimPattern = new RegExp(
    `\\b${documentedColorCount}\\b[\\s\\S]{0,160}\\bdocumented\\b[\\s\\S]{0,160}` +
      `\\b${extensionContributedColorCount}\\b[\\s\\S]{0,160}\\bextension-contributed\\b[\\s\\S]{0,160}` +
      `\\b${totalMappedColorCount}\\b`,
    "i"
  );

  assert.equal(documentedColorCount, 910);
  assert.equal(extensionContributedColorCount, 27);
  assert.equal(totalMappedColorCount, 937);
  assert.equal(new Set(extensionContributedColorIdentifiers).size, extensionContributedColorCount);
  for (const extensionContributedColorIdentifier of extensionContributedColorIdentifiers) {
    assert.ok(
      !documentedWorkbenchColorContract.identifiers.includes(extensionContributedColorIdentifier),
      `${extensionContributedColorIdentifier} must not be counted as documented`
    );
  }

  for (const coverageDocumentationPath of coverageDocumentationPaths) {
    const coverageDocumentation = readFileSync(coverageDocumentationPath, "utf8");
    assert.match(
      coverageDocumentation,
      coverageClaimPattern,
      `${relative(repositoryDirectory, coverageDocumentationPath)} has stale coverage counts`
    );
  }
  for (const themeContribution of extensionManifest.contributes.themes) {
    const themePath = resolve(repositoryDirectory, themeContribution.path.slice(2));
    const themeColors = JSON.parse(readFileSync(themePath, "utf8")).colors;
    assert.equal(Object.keys(themeColors).length, totalMappedColorCount, themeContribution.label);
  }
});

test("parses every issue form and requires both extension and VS Code versions", () => {
  const issueTemplateDirectory = resolve(repositoryDirectory, ".github/ISSUE_TEMPLATE");
  const issueFormFileNames = readdirSync(issueTemplateDirectory).filter(
    (fileName) => fileName.endsWith(".yml") && fileName !== "config.yml"
  );
  assert.ok(issueFormFileNames.length > 0);

  for (const issueFormFileName of issueFormFileNames) {
    const issueFormPath = resolve(issueTemplateDirectory, issueFormFileName);
    const issueForm = parseYaml(readFileSync(issueFormPath, "utf8"));
    assert.ok(Array.isArray(issueForm.body), `${issueFormFileName} must have a form body`);

    const versionInputs = issueForm.body.filter(
      (issueFormItem) =>
        issueFormItem?.type === "input" && /version/i.test(issueFormItem.attributes?.label ?? "")
    );
    assert.ok(
      versionInputs.length >= 2,
      `${issueFormFileName} needs extension and VS Code versions`
    );
    assert.ok(
      versionInputs.some(({ attributes }) => /everforest|extension/i.test(attributes.label)),
      `${issueFormFileName} needs an extension version input`
    );
    assert.ok(
      versionInputs.some(({ attributes }) => /vs\s*code/i.test(attributes.label)),
      `${issueFormFileName} needs a VS Code version input`
    );
    assert.ok(
      versionInputs.every(({ validations }) => validations?.required === true),
      `${issueFormFileName} version inputs must be required`
    );

    const settingsTextarea = issueForm.body.find(
      (issueFormItem) => issueFormItem?.id === "everforest-settings"
    );
    assert.match(
      settingsTextarea?.attributes?.description ?? "",
      /application-scoped\/global[\s\S]{0,180}sanitised native `window\.\*`\/`workbench\.\*` settings[\s\S]{0,120}workspace\/folder override context/i,
      `${issueFormFileName} should request optional sanitised native override context`
    );
  }
});

test("does not retain populated Unreleased changelog entries or Error Lens claims", () => {
  const changelogSource = readFileSync(resolve(repositoryDirectory, "CHANGELOG.md"), "utf8");
  for (const changelogSection of documentationSectionContents(changelogSource)) {
    if (!/\bunreleased\b/i.test(changelogSection.title)) continue;
    const populatedLines = changelogSection.contents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("<!--"));
    assert.deepEqual(populatedLines, [], "Unreleased changelog section must stay empty");
  }

  for (const markdownPath of markdownPaths) {
    assert.doesNotMatch(
      readFileSync(markdownPath, "utf8"),
      /\bError Lens\b/i,
      `${relative(repositoryDirectory, markdownPath)} must not claim unsupported Error Lens coverage`
    );
  }
});

test("routes conduct reports through verified GitHub project channels", () => {
  const codeOfConduct = readFileSync(resolve(repositoryDirectory, "CODE_OF_CONDUCT.md"), "utf8");
  assert.match(codeOfConduct, /GitHub issue forms/);
  assert.match(codeOfConduct, /github\.com\/contact\/report-abuse/);
  assert.doesNotMatch(codeOfConduct, /security\/advisories|Security Advisory/i);
});
