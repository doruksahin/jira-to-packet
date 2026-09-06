#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readStoreConfig } from '@doruksahin/task-packet-store';
import { packetSha256 } from '@doruksahin/task-packet-store/identity';

const SAFE_TICKET = /^[A-Z][A-Z0-9]+-\d+$/;
const SHA256 = /^[a-f0-9]{64}$/;

function fail(message) {
  throw new Error(message);
}

function absolute(value, label) {
  if (!path.isAbsolute(value)) fail(`${label} must be an absolute path: ${value}`);
  return path.resolve(value);
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${label} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseArguments(argv) {
  const mode = argv[0];
  const names =
    mode === 'calculate'
      ? new Set(['--store', '--ticket', '--packet'])
      : mode === 'compare'
        ? new Set(['--producer', '--fetched'])
        : null;
  if (!names)
    fail(
      'Usage: packet-identity.mjs calculate --store <absolute-json> --ticket <TICKET> --packet <absolute-dir> | compare --producer <absolute-json> --fetched <absolute-json>',
    );
  const result = {};
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!names.has(name) || value === undefined || value.startsWith('--')) fail(`invalid ${mode} arguments`);
    if (Object.hasOwn(result, name)) fail(`duplicate argument: ${name}`);
    result[name] = value;
  }
  const missing = [...names].find((name) => !Object.hasOwn(result, name));
  if (missing) fail(`missing required argument: ${missing}`);
  return { mode, values: result };
}

export function calculatePacketIdentity({ store, ticket, packet }) {
  if (!SAFE_TICKET.test(ticket)) fail(`invalid Jira ticket: ${ticket}`);
  const packetDirectory = absolute(packet, '--packet');
  if (path.basename(packetDirectory) !== ticket) fail(`packet directory must end in ${ticket}`);
  const config = readStoreConfig(absolute(store, '--store'));
  return { ticket, packetDirectory, packetSha256: packetSha256(packetDirectory, config.identity) };
}

function parseIdentity(value, label) {
  if (!value || typeof value !== 'object' || !SAFE_TICKET.test(value.ticket) || !SHA256.test(value.packetSha256)) {
    fail(`${label} does not contain a valid ticket and packetSha256`);
  }
  return value;
}

export function comparePacketIdentities(producer, fetched) {
  const left = parseIdentity(producer, 'producer identity');
  const right = parseIdentity(fetched, 'fetched identity');
  if (left.ticket !== right.ticket) fail(`packet ticket mismatch: producer ${left.ticket}, fetched ${right.ticket}`);
  if (left.packetSha256 !== right.packetSha256) {
    fail(`packet digest mismatch for ${left.ticket}: producer ${left.packetSha256}, fetched ${right.packetSha256}`);
  }
  return {
    ticket: left.ticket,
    producerPacketSha256: left.packetSha256,
    fetchedPacketSha256: right.packetSha256,
    match: true,
  };
}

async function main() {
  try {
    const { mode, values } = parseArguments(process.argv.slice(2));
    const result =
      mode === 'calculate'
        ? calculatePacketIdentity({
            store: values['--store'],
            ticket: values['--ticket'],
            packet: values['--packet'],
          })
        : comparePacketIdentities(
            readJson(absolute(values['--producer'], '--producer'), 'producer identity'),
            readJson(absolute(values['--fetched'], '--fetched'), 'fetched identity'),
          );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`PACKET_IDENTITY_FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
