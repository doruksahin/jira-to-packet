import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { regularFiles } from '@doruksahin/task-packet-store/identity';
import { prepareTaskPacket } from './prepare-task-packet.mjs';
import { calculatePacketIdentity, comparePacketIdentities } from './packet-identity.mjs';
import { runDependency, storeCommand, withoutStorageCredentials } from './process.mjs';
import { freshWorkspace, validateOptions } from './workspace.mjs';

const templates = fileURLToPath(new URL('../templates/', import.meta.url));
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

export async function jiraToPacket(options, { exporter, command = storeCommand } = {}) {
  const config = validateOptions(options);
  freshWorkspace(options, config);
  const { store, ticket, workspace } = options;
  const exportRoot = path.join(workspace, 'export');
  const receipt = path.join(workspace, 'jira-export-receipt.json');
  const profile = path.join(templates, 'jira-profile');
  fs.mkdirSync(exportRoot);
  if (exporter) await exporter({ ticket, exportRoot, receipt, profile });
  else runDependency('@doruksahin/jira-markdown-exporter', 'jira-markdown-export', [
    '--issue-keys', ticket, '--output-dir', exportRoot, '--template-dir', profile,
    '--download-attachments', '--receipt', receipt,
  ], withoutStorageCredentials());

  const prepared = await prepareTaskPacket({ ticket, exportRoot, receipt, profile, template: path.join(templates, 'packet') });
  write(path.join(workspace, 'prepare-output.json'), prepared);
  const producer = calculatePacketIdentity({ store, ticket, packet: prepared.packetDirectory });
  const expectedFiles = regularFiles(prepared.packetDirectory);
  write(path.join(workspace, 'producer-identity.json'), producer);
  write(path.join(workspace, 'push-output.json'), command(['push', '--store', store, '--ticket', ticket, '--from', prepared.packetDirectory]));
  const fetched = command(['fetch', '--store', store, '--ticket', ticket, '--destination', path.join(workspace, 'fetched')]);
  write(path.join(workspace, 'fetch-output.json'), fetched);
  const expectedDirectory = path.join(workspace, 'fetched', ticket);
  assert.equal(fetched.packetDirectory, expectedDirectory, 'fetch returned an unexpected packet directory');
  const actual = calculatePacketIdentity({ store, ticket, packet: fetched.packetDirectory });
  comparePacketIdentities(actual, fetched);
  write(path.join(workspace, 'identity-comparison.json'), comparePacketIdentities(producer, fetched));
  assert.deepEqual(regularFiles(fetched.packetDirectory), expectedFiles, 'saved packet files differ from producer output');
  const packet = command(['locate', '--store', store, '--ticket', ticket, '--path', '']);
  assert.equal(packet.ticket, ticket);
  assert.equal(packet.relativePath, '');
  assert.equal(packet.kind, 'directory');
  assert.equal(packet.driver, config.driver);
  assert(typeof packet.location === 'string' && packet.location.length > 0, 'store returned an empty location');
  const result = { ticket, status: 'packet-ready', packetSha256: fetched.packetSha256, packet };
  write(path.join(workspace, 'packet-result.json'), result);
  fs.writeFileSync(path.join(workspace, 'summary.md'),
    `Ticket: ${ticket}\n\nStatus: packet-ready\n\nPacket: ${packet.location}/\n\nOpen packet: ${packet.location}\n`, { flag: 'wx', mode: 0o600 });
  return result;
}
