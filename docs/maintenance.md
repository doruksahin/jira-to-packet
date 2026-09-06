# Producer maintenance

Start with the [architecture page](architecture/README.md) for boundaries and decisions;
the [CLI playbook](cli.md) owns operator inputs and outputs.

## Verify changes

```sh
pnpm check
python3 .architecture/check.py
lychee --config .lychee.toml --offline './*.md' './docs/**/*.md' './.architecture/**/*.md'
```

[Package checks](../package.json) cover full packet parity, partial export and attachment failure,
saved-byte verification, immutable prior stage runs, and an installed tarball executing from a
separate directory with an empty PATH. The installed CLI uses the real exporter and store;
the [test-only Jira preload](../test/fixtures/mock-jira.mjs) intercepts network reads with synthetic
responses. The Drive selection test exercises the same producer command sequence against a
fake transport boundary; actual Drive transport behavior belongs to the store's checks.

The [CI workflow](../.github/workflows/ci.yml) runs the release gate on Node 20 and 24.
[Architecture CI](../.github/workflows/architecture.yml) checks the shared contract and local
Markdown file targets and heading anchors with pinned Lychee. Install
[Lychee](https://github.com/lycheeverse/lychee#installation) 0.24.2 or newer for local checks.
When changing cross-repository links, run the same input selection with authenticated access
using the [owner's network check procedure](https://github.com/doruksahin/plugin-architecture/blob/main/docs/maintenance.md#check-links).
Offline CI does not verify private network URLs.

## Packet compatibility baseline

The templates and profile were extracted unchanged from the
[original producer at ee07828](https://github.com/doruksahin/AC-visual-walkthrough/blob/ee07828af532f2556775300ac3196f412f64febb/.github/scripts/jira-to-packet.mjs).
The [golden manifest](../test/fixtures/jira-to-packet/golden-manifest.json) records the source commit,
profile digest, packet identity, and every synthetic packet file's byte hash. The
[original preparation source](https://github.com/doruksahin/AC-visual-walkthrough/blob/ee07828af532f2556775300ac3196f412f64febb/.github/scripts/prepare-task-packet.mjs)
and [profile templates](https://github.com/doruksahin/AC-visual-walkthrough/tree/ee07828af532f2556775300ac3196f412f64febb/.github/packet-template)
remain immutable provenance. Golden data is reviewed compatibility evidence, not regenerated
automatically when a test fails. The profile's existing ID remains stable through extraction.

## Private releases

[Release Please](../.github/workflows/release-please.yml) owns versions, changelog, tags, and private
GitHub releases through [its manifest](../.release-please-manifest.json) and
[configuration](../release-please-config.json). Configure `RELEASE_PLEASE_TOKEN` with access to this
private repository before enabling release creation. The initial implementation has no published
release until its release PR is reviewed and merged. This package is private; no npm publication
job is configured.

Before accepting a release, run `pnpm release:check`. The release job checks the tag against the
package version, builds a tarball and SHA-256 checksum, verifies the installed artifact, and
attaches those exact bytes to the GitHub release. Existing assets are compared before reuse;
different bytes are rejected. To retry a created release, dispatch the same workflow with its
existing version tag. Source installation remains available before the first release.
