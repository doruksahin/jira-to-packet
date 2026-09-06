import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { smokeInstalledArtifact } from '../scripts/smoke-installed-artifact.mjs';

const execute = promisify(execFile);
const repository = fileURLToPath(new URL('../', import.meta.url));

test('packed executable runs the complete producer from a separate installed directory', { timeout: 120_000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'producer-artifact-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { stdout } = await execute('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory], { cwd: repository });
  const [artifact] = JSON.parse(stdout);
  const paths = artifact.files.map((file) => file.path);
  assert(paths.includes('bin/jira-to-packet.mjs'));
  assert(paths.includes('templates/packet/00 Packet.md.tmpl'));
  assert(paths.includes('templates/jira-profile/profile.json'));
  assert(!paths.some((file) => /^(test|node_modules|\.github|decree)\//.test(file)));
  assert.equal((await smokeInstalledArtifact(path.join(directory, artifact.filename))).status, 'installed-smoke-passed');
});
