import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const repository = fileURLToPath(new URL('../', import.meta.url));

export async function smokeInstalledArtifact(archive) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'producer installed '));
  try {
    await fs.writeFile(path.join(directory, 'package.json'), '{"private":true}');
    await execute('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false',
      '--@doruksahin:registry=https://registry.npmjs.org', '--prefix', directory, path.resolve(archive)],
      { cwd: directory, maxBuffer: 10 * 1024 * 1024 });
    const command = path.join(directory, 'node_modules/.bin/jira-to-packet');
    const cwd = path.join(directory, 'unrelated working directory');
    await fs.mkdir(cwd);
    const cleanRuntime = { cwd, env: { PATH: '' } };
    const help = await execute(process.execPath, [command, '--help'], cleanRuntime);
    assert.match(help.stdout, /Usage: jira-to-packet/);
    assert.equal(help.stderr, '');
    const version = await execute(process.execPath, [command, '--version'], cleanRuntime);
    const manifest = JSON.parse(await fs.readFile(path.join(repository, 'package.json'), 'utf8'));
    assert.equal(version.stdout, `${manifest.version}\n`);
    const store = path.join(directory, 'store.json');
    await fs.writeFile(store, JSON.stringify({ driver: 'fs', root: path.join(directory, 'persistent') }));

    // This uses the default child exporter invocation. Its receipt proves binary
    // resolution worked; missing credentials must produce no success on stdout.
    const failedWorkspace = path.join(directory, 'failed');
    await assert.rejects(execute(process.execPath, [command, '--store', store, '--ticket', 'PROJ-123', '--workspace', failedWorkspace], cleanRuntime), (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /^JIRA_TO_PACKET_FAILED: jira-markdown-export failed \(1\)\n$/);
      return true;
    });
    const failedReceipt = JSON.parse(await fs.readFile(path.join(failedWorkspace, 'jira-export-receipt.json'), 'utf8'));
    assert.equal(failedReceipt.status, 'failed');
    assert.match(failedReceipt.error, /JIRA_HOST/);
    await assert.rejects(fs.stat(path.join(failedWorkspace, 'packet-result.json')), { code: 'ENOENT' });

    const fixtures = path.join(repository, 'test/fixtures');
    const preload = path.join(directory, 'mock-jira.mjs');
    await fs.copyFile(path.join(fixtures, 'mock-jira.mjs'), preload);
    await fs.copyFile(path.join(fixtures, 'jira-to-packet/issue.json'), path.join(directory, 'issue.json'));
    const workspace = path.join(directory, 'success');
    const env = {
      PATH: '', NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
      JIRA_HOST: 'https://example.atlassian.net', JIRA_EMAIL: 'fixture@example.test', JIRA_API_TOKEN: 'fixture-only',
      PACKET_STORE_DRIVE_TOKEN: 'must-not-reach-exporter', RCLONE_CONFIG: 'must-not-reach-exporter',
    };
    const completed = await execute(process.execPath, [command, '--store', store, '--ticket', 'PROJ-123', '--workspace', workspace], { cwd, env });
    assert.equal(completed.stderr, '');
    assert.equal(completed.stdout.trim().split('\n').length, 1);
    const result = JSON.parse(completed.stdout);
    assert.equal(result.status, 'packet-ready');
    const golden = JSON.parse(await fs.readFile(path.join(fixtures, 'jira-to-packet/golden-manifest.json'), 'utf8'));
    assert.equal(result.packetSha256, golden.packetSha256);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace, 'packet-result.json'), 'utf8')), result);
    const childReceipt = JSON.parse(await fs.readFile(path.join(workspace, 'jira-export-receipt.json'), 'utf8'));
    assert.equal(childReceipt.profileDigest, golden.profileDigest);
    for (const file of golden.files) {
      const { createHash } = await import('node:crypto');
      assert.equal(createHash('sha256').update(await fs.readFile(path.join(result.packet.location, file.path))).digest('hex'), file.sha256);
    }
    return { status: 'installed-smoke-passed', version: manifest.version, packetSha256: result.packetSha256 };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/smoke-installed-artifact.mjs <package.tgz>');
    console.log(JSON.stringify(await smokeInstalledArtifact(process.argv[2])));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
