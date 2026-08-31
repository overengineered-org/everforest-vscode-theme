const semanticVersionPattern = /^\d+\.\d+\.\d+$/;

function escapeRegularExpressionText(textToEscape) {
  return textToEscape.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveExpectedInstalledExtensionVersion({
  packagedExtensionFileNames,
  sourcePackageVersion,
  extensionPackageName,
}) {
  if (packagedExtensionFileNames.length !== 1) {
    throw new Error(
      `Expected exactly one packaged VSIX, found ${packagedExtensionFileNames.length}`
    );
  }
  if (
    !semanticVersionPattern.test(sourcePackageVersion) &&
    sourcePackageVersion !== "0.0.0-development"
  ) {
    throw new Error(`Invalid source package version: ${sourcePackageVersion}`);
  }

  const [packagedExtensionFileName] = packagedExtensionFileNames;
  const extensionPackageNamePattern = escapeRegularExpressionText(extensionPackageName);
  const genericPackageNamePattern = new RegExp(`^${extensionPackageNamePattern}\\.vsix$`);
  if (genericPackageNamePattern.test(packagedExtensionFileName)) return sourcePackageVersion;

  const versionedPackageNamePattern = new RegExp(
    `^${extensionPackageNamePattern}-(\\d+\\.\\d+\\.\\d+)\\.vsix$`
  );
  const versionedPackageMatch = versionedPackageNamePattern.exec(packagedExtensionFileName);
  if (!versionedPackageMatch) {
    throw new Error(`Unexpected packaged VSIX filename: ${packagedExtensionFileName}`);
  }
  return versionedPackageMatch[1];
}

function findChangedThemeSourcePaths(originalThemeSources, regeneratedThemeSources) {
  const allThemeSourcePaths = new Set([
    ...originalThemeSources.keys(),
    ...regeneratedThemeSources.keys(),
  ]);
  return [...allThemeSourcePaths].filter(
    (themeSourcePath) =>
      originalThemeSources.get(themeSourcePath) !== regeneratedThemeSources.get(themeSourcePath)
  );
}

module.exports = {
  findChangedThemeSourcePaths,
  resolveExpectedInstalledExtensionVersion,
};
