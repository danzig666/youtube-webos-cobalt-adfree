# Homebrew catalog

Add this URL in **Homebrew Channel → Settings → Add repository**:

```text
https://raw.githubusercontent.com/danzig666/youtube-webos-cobalt-adfree/main/repo.json
```

Return to the app list after adding or refreshing the repository. The catalog
lists this fork's current published release, including beta releases:

| Entry | App ID | Installation |
| --- | --- | --- |
| YouTube Cobalt AdFree (Separate ID) | `com.cobalt.youtube.adfree` | Alongside official YouTube |
| YouTube AdFree (Original ID) | `youtube.leanback.v4` | Replaces official YouTube |

Choose the separate ID to retain official YouTube. For an existing fork install,
update the same ID to retain its private settings and resume cache. Both entries
have identical features. The catalog does not change YouTube sign-in behavior.
Developer Mode / webOS Device Manager installation remains available through the
IPKs on the release page; Homebrew is an additional distribution option.

## What is verified

`scripts/update-homebrew-catalog.py` downloads both public IPKs, their build
records and `SHA256SUMS` from one published release. It checks:

- Every required asset is uploaded, with the expected repository/download URL,
  exact byte count, checksum and GitHub digest when available.
- Both build records match the resolved release-tag commit and package names.
- The IPK control file and embedded appinfo agree on the real app ID and numeric
  package version; the target is ARM/native, with readable/executable payloads.
- The native runtime's digest and compiled source/app identity agree with the
  build record. The opposite package ID is absent from that runtime.

Catalog IDs match the actual installed app IDs. The `v2.6.29-beta.1` release,
for example, contains app version `2.6.29`; the catalog uses the real app version
for Homebrew update comparisons. Every changed binary must bump the app version,
even for another beta. Replacing the bytes of an already-listed app version is
rejected so an apparent update cannot silently retain the same installed version.

The generated `repo.json` contains two entries with actual download sizes and
SHA-256 values. Its source and icon links point to this fork. It includes no
upstream v1.2.5 entry and no invented `.beta` application identity.

## Automatic updates

The **Update Homebrew catalog** workflow is installed on `main`. It runs when a
release is published and can also be started manually with a published release
tag. It checks out the current trusted tools from `main`, including for releases
whose source tag predates this automation. Its regression tests also run on
relevant pushes and pull requests.

The existing **Publish verified release assets** workflow refreshes Homebrew
when attaching assets to an already-published release. Draft releases wait for
the publication event. This covers both publishing orders: attaching files
before publication, or completing an existing published release afterward.

Publication is a single update of `main/repo.json` containing both variants.
Incomplete releases, failed verification and older-version events leave the
current public catalog in place. A stale-file conflict re-reads the latest
catalog and repeats the version checks; it never forces an overwrite. Repeating
the same verified release is a no-op. Automated catalog commits do not rebuild
the TV app or modify published packages.

The public feed is always `main/repo.json`; another development branch's checked-in
snapshot is not the live feed. Do not edit download URLs or hashes by hand.

## Maintainer commands

Generate a local preview without changing GitHub:

```sh
python3 scripts/update-homebrew-catalog.py \
  --repository danzig666/youtube-webos-cobalt-adfree \
  --tag v2.6.29-beta.1 --output /tmp/ytaf-homebrew-repo.json
```

To publish, run **Actions → Update Homebrew catalog → Run workflow** on `main`
and enter the release tag, or run the command above with `--publish` using a
GitHub identity with repository contents write access. The output and public
catalog are deterministic; rerunning does not create another commit if unchanged.

If a future workflow publishes releases using `GITHUB_TOKEN`, call the updater
explicitly after publication in that workflow: GitHub suppresses recursive
release events created with that token. For a draft asset-upload step, use
`--skip-draft --publish`, as the current asset publisher does. Manually uploaded
replacement/completed assets can be checked by rerunning the catalog workflow.

Run `python3 scripts/test-homebrew-catalog.py` for offline package fixtures,
identity/checksum failures, atomic publication, downgrade/concurrency guards and
draft handling. The initial v2.6.29 feed was additionally generated from the real
public packages. No Homebrew Channel installation on a TV was performed here.
