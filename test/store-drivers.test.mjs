import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DRIVERS } from '@doruksahin/task-packet-store';

const playbook = fs.readFileSync(new URL('../docs/cli.md', import.meta.url), 'utf8');

for (const driver of DRIVERS) {
  test(`command playbook shows a copy-pasteable "${driver}" store configuration example`, () => {
    assert.ok(playbook.includes(`"driver":"${driver}"`),
      `docs/cli.md is missing a "${driver}" store configuration example`);
  });
}
