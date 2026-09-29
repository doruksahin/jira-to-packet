# Jira to packet

For responsibilities, interfaces, dependencies, storage behavior, or failure changes, read
the [architecture page](docs/architecture/README.md). For command behavior and operator output,
read the [CLI contract](docs/cli.md). For checks, source provenance, or releases, follow
[maintenance](docs/maintenance.md).

The producer exports and prepares one ticket, then verifies the saved packet. Storage operations
belong to task-packet-store. Keep packet production independent of consumer runtimes and LLMs.
Preserve the [frozen packet baseline](test/fixtures/jira-to-packet/golden-manifest.json) unless an
explicitly governed format change updates producer and consumer compatibility together.

Use synthetic tickets in tests and examples; credentials remain in environment variables.
The source repository is public; the package remains `private: true` with no npm publishing rail.
Run `pnpm check` after changes.
