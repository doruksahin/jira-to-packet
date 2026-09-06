#!/usr/bin/env node
import fs from 'node:fs';
import { jiraToPacket } from '../src/jira-to-packet.mjs';
import { argumentsFor } from '../src/workspace.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  process.stdout.write(`Usage: jira-to-packet --store <absolute-json> --ticket <PROJ-123> --workspace <fresh-absolute-dir>

Input: JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN and an existing task-packet-store configuration.
Storage: the configuration selects local files or Google Drive; the producer command is identical.
Output: one JSON packet-ready result after export, preparation, push, fresh fetch, byte and identity verification, and locate.
Diagnostics: the fresh workspace retains receipts and packet-result.json plus summary.md on success.
Exit: 0 on success, 1 on any failure; failures leave stdout empty.
`);
} else if (args.length === 1 && args[0] === '--version') {
  process.stdout.write(`${JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}\n`);
} else {
  try {
    process.stdout.write(`${JSON.stringify(await jiraToPacket(argumentsFor(args)))}\n`);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, ' ');
    process.stderr.write(`JIRA_TO_PACKET_FAILED: ${message}\n`);
    process.exitCode = 1;
  }
}
