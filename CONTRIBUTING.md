# Contributing

Thanks for stopping by! mini-code is tiny on purpose — please keep it that way.

## Quick start

```bash
git clone https://github.com/ice-wocker/mini-code.git
cd mini-code
npm ci
npm run check     # must pass before every PR
npm run e2e       # needs tmux, for UI changes
```

## Ground rules

- Small PRs win: one feature/fix per PR, < 300 lines if possible.
- `src/` stays dependency-light — think twice before adding a package.
- New tool or slash command? Update `README.md` + add a case in `test/check.mjs`.
- Security-sensitive code (`sandbox.js`, `tools.js`, confirm flow): explain the threat model in the PR.
- 中文 / English both welcome in issues and PRs.

## Filing issues

Use the templates (bug / feature). A good bug report = repro steps + expected vs actual + `node --version` + terminal (Termux? tmux?).
