import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { regularFiles } from '@doruksahin/task-packet-store/identity';
import { jiraToPacket } from '../src/jira-to-packet.mjs';
import { storeCommand, withoutStorageCredentials } from '../src/process.mjs';
import { argumentsFor } from '../src/workspace.mjs';
import { fixtureExporter, setup, read, write } from './fixture.mjs';

const golden = read(new URL('./fixtures/jira-to-packet/golden-manifest.json', import.meta.url));
const exporter = fixtureExporter();

test('preserves every original packet byte, profile digest, and identity through real filesystem storage', async (t) => {
  const options = setup(t);
  const result = await jiraToPacket(options, { exporter });
  assert.equal(result.status, 'packet-ready');
  assert.equal(result.packetSha256, golden.packetSha256);
  assert.equal(read(path.join(options.workspace, 'prepare-output.json')).profileDigest, golden.profileDigest);
  assert.deepEqual(regularFiles(result.packet.location), golden.files);
  assert.deepEqual(regularFiles(read(path.join(options.workspace, 'fetch-output.json')).packetDirectory), golden.files);
  assert.deepEqual(read(path.join(options.workspace, 'packet-result.json')), result);
  assert.equal(fs.readFileSync(path.join(options.workspace, 'summary.md'), 'utf8'),
    `Ticket: ${options.ticket}\n\nStatus: packet-ready\n\nPacket: ${result.packet.location}/\n\nOpen packet: ${result.packet.location}\n`);
});

test('refreshes preserve all previously saved stage run bytes', async (t) => {
  const options = setup(t);
  const first = await jiraToPacket(options, { exporter });
  const run = path.join(first.packet.location, 'stages/20-ac-walkthrough/runs/v1');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'report.html'), '<html>prior run</html>');
  const before = regularFiles(run);
  const second = await jiraToPacket({ ...options, workspace: path.join(options.directory, 'again') }, { exporter });
  assert.equal(second.packetSha256, first.packetSha256);
  assert.deepEqual(regularFiles(run), before);
});

for (const operation of ['push', 'fetch', 'locate']) {
  test(`does not claim packet-ready if ${operation} fails`, async (t) => {
    const options = setup(t);
    await assert.rejects(jiraToPacket(options, { exporter, command(args) {
      if (args[0] === operation) throw new Error('injected failure');
      return storeCommand(args);
    } }), /injected failure/);
    assert(!fs.existsSync(path.join(options.workspace, 'packet-result.json')));
    assert(!fs.existsSync(path.join(options.workspace, 'summary.md')));
  });
}

for (const mutation of ['missing', 'corrupt', 'extra']) {
  test(`rejects ${mutation} saved scaffold outside the identity digest`, async (t) => {
    const options = setup(t);
    await assert.rejects(jiraToPacket(options, { exporter, command(args) {
      if (args[0] === 'fetch') {
        const scaffold = path.join(read(options.store).root, options.ticket, 'stages/20-ac-walkthrough/README.md');
        if (mutation === 'missing') fs.unlinkSync(scaffold);
        else if (mutation === 'corrupt') fs.writeFileSync(scaffold, 'corruption');
        else fs.writeFileSync(path.join(path.dirname(scaffold), 'unexpected.txt'), 'extra');
      }
      return storeCommand(args);
    } }), /saved packet files differ/);
    assert(!fs.existsSync(path.join(options.workspace, 'packet-result.json')));
  });
}

test('recomputes fetched bytes instead of trusting a fabricated fetch digest', async (t) => {
  const options = setup(t);
  await assert.rejects(jiraToPacket(options, { exporter, command(args) {
    const receipt = storeCommand(args);
    if (args[0] === 'fetch') return { ...receipt, packetSha256: 'a'.repeat(64) };
    return receipt;
  } }), /packet digest mismatch/);
  assert(!fs.existsSync(path.join(options.workspace, 'packet-result.json')));
});

for (const [name, transform] of [
  ['partial', (receipt) => ({ ...receipt, status: 'partial', failed: 1, total: 2 })],
  ['profile drift', (receipt) => ({ ...receipt, profileDigest: `sha256:${'0'.repeat(64)}` })],
  ['wrong ticket', (receipt) => ({ ...receipt, issues: [{ ...receipt.issues[0], key: 'OTHER-1' }] })],
]) {
  test(`rejects ${name} receipt before preparation or storage writes`, async (t) => {
    const options = setup(t);
    let called = false;
    await assert.rejects(jiraToPacket(options, {
      exporter: fixtureExporter({ transformReceipt: transform }), command() { called = true; },
    }));
    assert.equal(called, false);
    assert(!fs.existsSync(path.join(options.workspace, 'export', options.ticket, '00 Packet.md')));
    assert(!fs.existsSync(path.join(options.workspace, 'packet-result.json')));
  });
}

test('fails closed on attachment warnings even if issue export reports success', async (t) => {
  const options = setup(t);
  let called = false;
  await assert.rejects(jiraToPacket(options, {
    exporter: fixtureExporter({ downloadAttachment: async () => { throw new Error('fixture attachment missing'); } }),
    command() { called = true; },
  }), /incomplete attachments/);
  assert.equal(called, false);
});

test('literal template-shaped Jira text remains unexpanded', async (t) => {
  const options = setup(t);
  const result = await jiraToPacket(options, { exporter: fixtureExporter({ issueOverrides: { summary: 'Fix {{name}} placeholder' } }) });
  assert.match(fs.readFileSync(path.join(result.packet.location, '00 Packet.md'), 'utf8'), /Fix \{\{name\}\} placeholder/);
});

test('rejects invalid arguments, occupied workspaces, and store overlap without changing existing bytes', async (t) => {
  const options = setup(t);
  for (const args of [[], ['--ticket', '../BAD'], ['--store', 'relative', '--ticket', options.ticket, '--workspace', options.workspace], ['--unknown', 'x']]) {
    assert.throws(() => argumentsFor(args));
  }
  fs.mkdirSync(options.workspace);
  fs.writeFileSync(path.join(options.workspace, 'keep.txt'), 'keep');
  const before = regularFiles(options.directory);
  for (const workspace of [options.workspace, options.directory, read(options.store).root, path.join(read(options.store).root, 'nested')]) {
    await assert.rejects(jiraToPacket({ ...options, workspace }, { exporter }), /fresh|separate/);
    assert.deepEqual(regularFiles(options.directory), before);
  }
});

test('same producer operation order works with a Drive-configured store command', async (t) => {
  const options = setup(t);
  const fsStore = path.join(options.directory, 'fixture-fs.json');
  fs.copyFileSync(options.store, fsStore);
  write(options.store, { driver: 'gdrive', sharedDriveId: 'synthetic-drive-id', prefix: 'packets' });
  const calls = [];
  const result = await jiraToPacket(options, { exporter, command(args) {
    calls.push(args[0]);
    if (args[0] === 'locate') return { ticket: options.ticket, driver: 'gdrive', relativePath: '', kind: 'directory', location: 'https://drive.google.com/drive/folders/synthetic-folder' };
    return storeCommand(args.map((arg) => arg === options.store ? fsStore : arg));
  } });
  assert.deepEqual(calls, ['push', 'fetch', 'locate']);
  assert.equal(result.packet.driver, 'gdrive');
  assert.equal(result.packetSha256, golden.packetSha256);
});

test('export subprocess credential filter removes storage and ambient rclone values', () => {
  assert.deepEqual(withoutStorageCredentials({ JIRA_API_TOKEN: 'fixture', PATH: '/bin', PACKET_STORE_DRIVE_TOKEN: 'secret', RCLONE_CONFIG: 'secret' }),
    { JIRA_API_TOKEN: 'fixture', PATH: '/bin' });
});
