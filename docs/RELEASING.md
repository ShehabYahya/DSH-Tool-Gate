# Releasing DSH Tool Gate

DSH Tool Gate uses npm Trusted Publishing (OIDC) for normal releases. The only manual bootstrap is the very first npm publication because npm requires a package to exist before a Trusted Publisher can be attached to it.

## One-time bootstrap for 1.0.0

From a clean checkout of `main`:

```bash
pnpm install
pnpm run check
pnpm run build
npm pack --dry-run
npm login
npm publish
```

`package.json` already marks the package as public. Complete npm's interactive authentication/2FA when prompted.

After the first publish, verify:

```bash
npm view dsh-tool-gate@1.0.0 version
```

It must print:

```text
1.0.0
```

## Configure npm Trusted Publishing

On npmjs.com, open the `dsh-tool-gate` package, then **Settings → Trusted Publishing → Add trusted publisher → GitHub Actions**.

Use:

- GitHub organization/user: `ShehabYahya`
- Repository: `DSH-Tool-Gate`
- Workflow filename: `publish.yml`
- Environment: leave empty
- Allowed action: enable `npm publish`

The workflow lives at `.github/workflows/publish.yml` and has the required GitHub `id-token: write` permission.

After OIDC is verified, npm provenance is generated automatically for GitHub-hosted trusted publishes.

## Finish the 1.0.0 GitHub release

Once `dsh-tool-gate@1.0.0` exists on npm, run the **Publish npm and GitHub Release** workflow manually from the GitHub Actions tab with:

```text
v1.0.0
```

Because 1.0.0 is already on npm, the workflow will safely skip npm publication, create the `v1.0.0` tag if necessary, verify the registry version, and create the GitHub Release with the packed `.tgz` attached.

## Normal future release

1. Update `package.json` version on `main` and merge the change.
2. Run the **Publish npm and GitHub Release** workflow manually with the matching tag, for example `v1.0.1`.
3. The workflow:
   - runs typecheck/tests/build;
   - checks that `v1.0.1` exactly matches `package.json` version `1.0.1`;
   - creates the tag if it does not exist;
   - packs the npm artifact;
   - publishes via npm OIDC if that version is not already present;
   - verifies the version from the public npm registry;
   - creates the GitHub Release and attaches the `.tgz`.

Pushing an already-created `v*` tag also triggers the same workflow.

## Recovery / idempotency

The workflow is safe to rerun for the same version. If npm already contains the version, publication is skipped and registry verification still runs. If the GitHub Release already exists, the packed artifact is uploaded/replaced instead of creating a duplicate release.

A tag that does not match the package version, or a tag that already points to a different commit, causes the workflow to fail before publishing.
