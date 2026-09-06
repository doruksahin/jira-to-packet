# jira-to-packet architecture

## Responsibility

Produce a frozen task packet from one Jira ticket and verify its saved files.
This repository owns Jira export orchestration, packet templates, preparation, and delivery.
Downstream workflows own their input validation, execution, and reports.

## Interfaces

The [CLI](../../bin/jira-to-packet.mjs) takes an explicit store configuration, ticket key,
and fresh absolute workspace. It returns one JSON receipt with `status: "packet-ready"`,
`packetSha256`, and `packet.location`. Read the [command contract](../cli.md) for flags,
credentials, diagnostics, and exact outputs.

## Dependencies

[package.json](../../package.json) installs the Jira exporter and task-packet-store.
The [process adapter](../../src/process.mjs) resolves those installed packages independently
of the caller's working directory. The [preparer](../../src/prepare-task-packet.mjs) uses
the exporter's receipt and profile helpers; the [identity adapter](../../src/packet-identity.mjs)
uses the store's identity contract. AC is a downstream consumer, with no source import or
installation dependency here.

## Execution and storage

Node.js runs the same [producer](../../src/jira-to-packet.mjs) on a computer or CI runner.
The configured store is the persistent home; the fresh workspace holds processing copies
and diagnostic receipts. Local storage requires a reachable durable directory. Drive storage
requires rclone and explicit credentials, as defined by the
[store owner](https://github.com/doruksahin/task-packet-store/blob/main/docs/design/03-architecture.md).
The producer passes configuration through to the store; transport selection belongs there.

## Failure behavior

An incomplete Jira export, invalid receipt, existing workspace, changed stored bytes, or
failed storage operation stops packet creation without a success receipt. A failure after
upload can leave stored files; inspect workspace diagnostics before retrying with a new
workspace. A downstream AC input verdict is made by AC when it consumes the packet.

## Current implementation

The [producer](../../src/jira-to-packet.mjs) connects export → preparation → push → fetch →
identity and file verification → locate. Its [templates](../../templates/jira-profile/profile.json)
and golden fixture preserve the packet format extracted from AC. The
[shared playbook](https://github.com/doruksahin/plugin-architecture/blob/main/docs/workflows.md)
connects this command to AC and other workflows; the
[source model](https://github.com/doruksahin/plugin-architecture/blob/main/model/current.dsl)
records repository ownership and source evidence.

## Planned changes

No further responsibility change is planned here. New packet formats or upstream sources
need their own explicit contract and compatibility decision.

## Decisions

The [accepted ownership decision](https://github.com/doruksahin/plugin-architecture/blob/main/decree/adr/architecture/adr-01m1tz0m9qtxe1a4adj3w6gczk-use-a-shared-architecture-model-and-repository-contracts.md)
and [producer extraction specification](https://github.com/doruksahin/plugin-architecture/blob/main/decree/spec/architecture/producer/spec-01m1v8g3067c5e212pahe5fvrc-extract-the-jira-producer-and-enforce-repository-boundaries.md)
govern this boundary. The [shared standard](https://github.com/doruksahin/plugin-architecture/blob/main/standard/README.md)
defines the architecture page format and link policy.

## Verification

Follow [maintenance](../maintenance.md) for package tests, installed-artifact checks, and
local file/anchor and authenticated network link checks. The
[repository contract](../../.architecture/contract.json) enforces installed internal dependencies,
source paths, and forbidden consumer references through the
[shared checker](../../.architecture/SOURCE.md). Behavioral tests verify packet bytes and
storage round trips; a link resolving alone does not prove behavior or a live Drive run.
