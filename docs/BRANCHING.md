# Branching Strategy

Two long-lived branches. New work always lands in `beta` first and is promoted to `prod` only after beta testing is done.

| Branch | Purpose | Who can change it |
|---|---|---|
| `prod` | Production. Always deployable; what real hospitals and parents use. | Pull requests from `beta` (or `hotfix/*`) only |
| `beta` | Integration + testing. Every new feature lands here first. | Pull requests from `feature/*`, `fix/*` only |
| `feature/<name>` | One feature or task, e.g. `feature/babies-module` | Developer |
| `fix/<name>` | Non-urgent bug fix found during beta | Developer |
| `hotfix/<name>` | Urgent production fix, branched from `prod` | Developer |

## Normal flow

```
feature/x ──PR──▶ beta ──(beta testing passes)──PR──▶ prod ──▶ tag vX.Y.Z
```

1. Branch from `beta`: `git switch beta && git pull && git switch -c feature/<name>`
2. Build the feature and **test it on the feature branch** (unit + e2e tests, manual check). Don't merge until it works.
3. Open a PR **into `beta`**. CI (build, lint, unit + e2e tests) must pass. Squash-merge.
4. `beta` now holds all finished features. It is deployed to the beta environment and **tested together** (QA / UAT).
5. When beta testing is done, open a PR **`beta` → `prod`** and merge with a **merge commit** (not squash, so the two branches don't drift apart).
6. Tag the release on `prod`: `git tag v0.2.0 && git push --tags`, then deploy.

Bugs found during beta testing are fixed on a `fix/<name>` branch from `beta` and merged back into `beta`.

## Hotfix flow (production is broken)

1. Branch from `prod`: `git switch prod && git pull && git switch -c hotfix/<name>`
2. PR into `prod`, merge, tag a patch release (e.g. `v0.2.1`).
3. **Immediately merge `prod` back into `beta`** so the fix isn't lost on the next promotion.

## Rules
- No direct commits or force-pushes to `prod` or `beta`.
- Nothing reaches `prod` without having been in `beta`, except a hotfix.
- Commit messages: short imperative subject, optionally prefixed `feat:`, `fix:`, `docs:`, `chore:`, `test:`.
- Database: beta and prod use **separate databases**. Schema changes are created with `prisma migrate dev` on a feature branch, committed with the PR, applied to beta by `prisma migrate deploy`, and applied to prod the same way on promotion. Never edit a migration that has already reached `beta`.
- Secrets live in environment variables per environment, never in git.

## GitHub settings to apply (repository → Settings)
- **Default branch:** `beta` (so new PRs target it by default).
- **Branch protection on `prod`:** require a pull request before merging; require status checks to pass; block force pushes and deletion; (optional) require 1 approval.
- **Branch protection on `beta`:** require a pull request; require status checks to pass; block force pushes and deletion.
- Retire the old `main` branch once everyone has switched to `beta` / `prod`.
