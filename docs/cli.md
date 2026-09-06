# Command playbook

## Install

This is a private repository. Use an authenticated checkout or a tarball downloaded from a
[private GitHub release](https://github.com/doruksahin/jira-to-packet/releases).
An initial checkout can build the same artifact without waiting for a release:

```sh
git clone https://github.com/doruksahin/jira-to-packet.git
cd jira-to-packet
corepack enable
pnpm install --frozen-lockfile
pnpm release:artifact /tmp/jira-producer-package
npm install --global /tmp/jira-producer-package/*.tgz --@doruksahin:registry=https://registry.npmjs.org
jira-to-packet --version
```

Input: repository access and Node.js 20.6 or newer. Use a fresh artifact output directory.
Output: an installed `jira-to-packet` command that can run from any working directory.
The registry option selects the public registry for the producer's existing exporter/store
dependencies; the producer itself is installed from the private tarball.

## Choose storage once

Create an absolute-path JSON file such as `/inputs/store.json` using the
[store configuration contract](https://github.com/doruksahin/task-packet-store/blob/main/docs/design/03-architecture.md).

For local storage:

```json
{"driver":"fs","root":"/data/task-packets"}
```

For Google Drive:

```json
{"driver":"gdrive","sharedDriveId":"YOUR_SHARED_DRIVE_ID","prefix":"packets"}
```

For Drive, install rclone and supply credentials using the
[store server setup](https://github.com/doruksahin/task-packet-store/blob/main/docs/design/04-server-operation.md).
The same configuration file can be passed to later workflows. Local storage needs no rclone or
Google credentials. Temporary execution files are separate from persistent storage.

## Export and save

Supply `JIRA_HOST`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` through the runner's environment using the
[exporter setup contract](https://github.com/doruksahin/jira-markdown-exporter/blob/main/docs/server-operation.md).
Then run:

```sh
jira-to-packet --store /inputs/store.json --ticket PROJ-123 --workspace /tmp/PROJ-123-producer
```

| Input | Meaning |
| --- | --- |
| `--store` | Existing absolute-path store configuration |
| `--ticket` | One Jira key, such as `PROJ-123` |
| `--workspace` | New or empty absolute directory, separate from the store |

Successful stdout contains exactly one JSON object:

```json
{"ticket":"PROJ-123","status":"packet-ready","packetSha256":"<64 hex characters>","packet":{"ticket":"PROJ-123","driver":"fs","relativePath":"","kind":"directory","location":"/data/task-packets/PROJ-123"}}
```

With the Drive configuration, `packet.location` is the Drive folder URL. Storage is selected by
the configuration; there is no second producer command. The persistent folder contains Jira
Markdown and attachments plus the [packet scaffolding](../templates/packet/00%20Packet.md.tmpl).
Jira comments remain context; production does not invent human acceptance approval.

## Inspect output or retry

| Workspace output | Available after |
| --- | --- |
| `jira-export-receipt.json`, `export/PROJ-123/` | Export attempt and downloaded source |
| `prepare-output.json` | Successful receipt and profile verification, scaffolding written |
| `producer-identity.json` | Original packet digest calculated |
| `push-output.json` | Store push succeeded |
| `fetch-output.json`, `fetched/PROJ-123/` | Fresh saved copy retrieved |
| `identity-comparison.json` | Original and fetched identities agree |
| `packet-result.json`, `summary.md` | All files verified and saved location resolved |

Exit code is 0 on success and 1 on any failure. Failure stdout is empty; stderr contains one
`JIRA_TO_PACKET_FAILED: message` line. `--help` and `--version` print their respective information.
Failed and partial exports, attachment warnings, changed profile provenance, storage failures,
or changed saved bytes prevent `packet-ready`. Earlier diagnostic files remain available.
The identity comparison alone is not completion: file verification and location resolution follow it.

Use a fresh workspace for a retry. An error after push may leave a stored packet but never claims
it is ready. Refreshing the ticket preserves existing stage runs according to the store's push
contract. Pass a successfully saved packet to the
[AC consumer flow](https://github.com/doruksahin/AC-visual-walkthrough/blob/main/docs/portable-workflows.md).

## Run in GitHub Actions

The [manual producer workflow](../.github/workflows/jira-to-packet.yml) accepts one ticket.
Set repository variable `PACKET_STORE_CONFIG` to the store JSON, and configure Jira credentials
as repository secrets. For Drive, also configure the store's supported credential secret named
in the workflow. The job validates configuration before export, installs rclone only for Drive,
writes temporary work under the runner's temporary directory, saves through the configured store,
and attaches diagnostic receipts.

A local filesystem selected in a disposable runner lasts only as long as that runner. Choose a
persistent mounted filesystem or Drive when a later independent job needs to fetch the packet.
