# @josh803316/shared-ci-workflows

Reusable GitHub Actions workflows and tooling for consistent Vercel deployments across all `@josh803316` projects.

Used by: `lll-experience`, `elysia-playground`, `how-ad-tech-works`.

---

## Reusable GitHub Actions Workflows

### Preview Deployments (on every PR)

In your repo create `.github/workflows/preview.yml`:

```yaml
on:
  pull_request:

jobs:
  preview:
    uses: josh803316/shared-ci-workflows/.github/workflows/vercel-preview.yml@main
    with:
      app-name: my-app
      vercel-project-id: prj_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      vercel-org-id: team_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    secrets:
      vercel-token: ${{ secrets.VERCEL_TOKEN }}
```

The workflow will:
1. Install & build your app
2. Deploy a preview to Vercel
3. Comment the preview URL on the PR (and update it on re-push)

### Production Deployments (on merge to main)

In your repo create `.github/workflows/production.yml`:

```yaml
on:
  push:
    branches: [main]

jobs:
  production:
    uses: josh803316/shared-ci-workflows/.github/workflows/vercel-production.yml@main
    with:
      app-name: my-app
      vercel-project-id: prj_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      vercel-org-id: team_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    secrets:
      vercel-token: ${{ secrets.VERCEL_TOKEN }}
```

### Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `app-name` | No | `App` | Label used in PR comments and summaries |
| `vercel-project-id` | Yes | — | Vercel project ID (`prj_...`) |
| `vercel-org-id` | Yes | — | Vercel org/team ID (`team_...`) |
| `install-command` | No | `bun install --frozen-lockfile` | Dependency install command |
| `build-command` | No | `bun run build` | Build command |

---

## `env-config` CLI

A local + Vercel environment variable manager. Install the package and run:

```sh
bun add -D @josh803316/shared-ci-workflows
# or use npx / bunx
bunx env-config --help
```

### Commands

| Command | Description |
|---------|-------------|
| `env-config list [env]` | List all vars in `.env` or `.env.<env>` |
| `env-config get <key> [env]` | Print a single variable's value |
| `env-config set <key> <value> [env]` | Set a variable in a local .env file |
| `env-config delete <key> [env]` | Remove a variable |
| `env-config switch <env>` | Symlink `.env` → `.env.<env>` |
| `env-config envs` | List available `.env.*` files |
| `env-config pull [env]` | Pull vars from Vercel into a local file |
| `env-config push [env]` | Push local vars to Vercel (interactive) |

### Example workflow

```sh
# Pull development vars from Vercel
env-config pull development

# Switch your active env to development
env-config switch development

# Check what's there
env-config list

# Add a local override
env-config set API_URL http://localhost:3000

# Push all development vars back to Vercel
env-config push development
```

---

## Utility modules (TypeScript)

Import helpers in your own CI scripts:

```ts
import {getBranchName, determineEnvironment, sanitizeBranch} from '@josh803316/shared-ci-workflows/src/utils/coreUtils';
import {deploy, pullEnv} from '@josh803316/shared-ci-workflows/src/utils/vercelUtils';
import {parseEnvFile, validateRequiredKeys} from '@josh803316/shared-ci-workflows/src/utils/envUtils';
```
