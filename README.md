# Jira to packet

Create a task packet from one Jira issue and save it through your selected local or Google Drive
store. The runner can be your computer or CI; the command and result stay the same.

```sh
jira-to-packet --store /inputs/store.json --ticket PROJ-123 --workspace /tmp/PROJ-123-producer
```

Input: Jira credentials, an existing store configuration, a ticket, and a fresh temporary workspace.
Output: one JSON object with `status: "packet-ready"`, the packet digest, and the saved packet location.
The command checks the exporter receipt, prepares the packet, pushes it, fetches a fresh copy,
compares every saved file and its identity, then resolves the location.

Start with [installation and the command playbook](docs/cli.md). The
[cross-repository workflow playbook](https://github.com/doruksahin/plugin-architecture/blob/main/docs/workflows.md)
explains how a saved packet feeds a later walkthrough and report delivery.

For implementation work, read the [architecture page](docs/architecture/README.md),
[agent guide](AGENTS.md), or [maintenance and release checks](docs/maintenance.md).
