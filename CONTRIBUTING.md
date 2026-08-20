# Contributing

1. Create a focused branch.
2. Change TypeScript source, not generated theme JSON.
3. Run `npm run generate` to update the committed theme JSON.
4. Run `npm test` and `npm run package:verify`.
5. Open a pull request with a Conventional Commit title.

Use `fix:` for corrections, `feat:` for user-visible additions, and `feat!:` for breaking changes.
Use squash merge and keep the final squash commit title in the same format.
