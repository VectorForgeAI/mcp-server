# Git hooks for this repo

After cloning, run once:

```bash
git config core.hooksPath .githooks
```

The `pre-push` hook runs the project's lint / typecheck / test commands
before any `git push`. It mirrors what CI runs, so red CI is caught locally.

Bypass with `git push --no-verify` only when fixing the hook itself.
