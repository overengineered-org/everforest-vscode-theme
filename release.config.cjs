module.exports = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    [
      "@semantic-release/exec",
      {
        prepareCmd: "node scripts/package-release.mjs ${nextRelease.version}",
      },
    ],
    [
      "@semantic-release/github",
      {
        assets: [
          {
            path: "dist/everforest-complete-*.vsix",
            label: "Everforest Complete VSIX",
          },
          {
            path: "dist/everforest-complete-*.vsix.sha256",
            label: "SHA-256 checksum",
          },
        ],
        failComment: false,
        failTitle: false,
        releasedLabels: false,
        successComment: false,
      },
    ],
  ],
};
