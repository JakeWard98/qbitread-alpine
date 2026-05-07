# Release Tag Convention

All releases must use semantic versioning tags prefixed with `v`.

## Format

```
v<MAJOR>.<MINOR>.<PATCH>
```

## Examples

| Tag       | When to use                                  |
|-----------|----------------------------------------------|
| `v0.0.1`  | First release / early development            |
| `v0.1.0`  | New feature added during initial development |
| `v1.0.0`  | First stable release                         |
| `v1.2.3`  | Patch release on a stable version            |
| `v2.0.0`  | Breaking change                              |

## Docker tags published per release

When you publish a release (e.g. `v1.2.3`), the workflow automatically
pushes the following tags to `ghcr.io/jakeward98/qbitread-alpine`:

| Docker tag    | Meaning                                    |
|---------------|--------------------------------------------|
| `1.2.3`       | Exact version — immutable, safe to pin     |
| `1.2`         | Latest patch for this minor version        |
| `1`           | Latest minor+patch for this major version  |
| `latest`      | Most recently published stable release     |
| `beta`        | Most recently published pre-release        |
| `buildcache`  | Internal layer cache — do not use directly |

The same rules apply to pre-v1 versions. For `v0.0.1` the tags are
`0.0.1`, `0.0`, `0`, and `latest`.

Pre-releases (e.g. `v1.0.0-beta.1`) produce only the exact version tag
and the `beta` tag — they do **not** update `latest`, `major.minor`, or
`major`.

## How to cut a release

1. Merge all changes to `main`.
2. On GitHub, go to **Releases → Draft a new release**.
3. In **Choose a tag**, type the new version (e.g. `v0.1.0`) and select
   **Create new tag on publish**.
4. Fill in the release title and notes.
5. Click **Publish release**.
6. The `Build and Publish Docker Image` workflow fires automatically.

## Pre-release handling

Pre-releases (any tag containing a hyphen, e.g. `v1.0.0-beta.1`) are
handled differently from stable releases:

- They do **not** update the `latest` tag (`latest=auto` in the workflow).
- They receive the rolling `beta` tag, so `ghcr.io/jakeward98/qbitread-alpine:beta`
  always points to the most recent pre-release.
- Semver `major.minor` and `major` floating tags are not generated for
  pre-releases.

To publish a pre-release, check the **Set as a pre-release** checkbox on
the GitHub release form.

## Pulling the image

```bash
# Latest stable release
docker pull ghcr.io/jakeward98/qbitread-alpine:latest

# Specific version
docker pull ghcr.io/jakeward98/qbitread-alpine:0.0.1
```

Or update `docker-compose.yml` to use the pre-built image:

```yaml
services:
  qbitread:
    image: ghcr.io/jakeward98/qbitread-alpine:latest
    # Remove the 'build: .' line when using a pre-built image
```
