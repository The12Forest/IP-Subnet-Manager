# Contributing to Subnet Manager

Thanks for your interest in contributing. Here's how to get involved.

## Reporting Bugs

Open a [GitHub Issue](../../issues/new?template=bug_report.md) and include:

- Clear steps to reproduce
- What you expected vs. what happened
- Node.js version, Docker version, browser, and OS
- Relevant logs (`docker logs subnet-manager`)

## Suggesting Features

Open a [GitHub Issue](../../issues/new?template=feature_request.md) with the
`enhancement` label, or start a discussion under **Discussions**.

## Submitting a Pull Request

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature`
3. Keep commits small and descriptive
4. Test locally:
   ```sh
   cp .env.example .env
   # Edit .env and set JWT_SECRET
   npm install
   node src/server.js
   ```
5. Open a PR against `main` with a clear title and description
6. Update `CHANGELOG.md` under `[Unreleased]`

## Code Style

- Plain JavaScript — no TypeScript, no build step
- CommonJS (`require`/`module.exports`) throughout
- 2-space indentation, single quotes
- No comments unless the *why* is truly non-obvious
- No unnecessary abstractions — three similar lines beats a premature helper

## License

All contributions are licensed under [CC BY-NC-SA 4.0](LICENSE).
By submitting a PR you agree that your code will be published under this license.
