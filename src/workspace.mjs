import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readStoreConfig } from '@doruksahin/task-packet-store';

export function argumentsFor(argv) {
  const required = ['store', 'ticket', 'workspace'];
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, '');
    assert(argv[i] === `--${name}` && required.includes(name), `unknown argument: ${argv[i]}`);
    assert(argv[i + 1] && !argv[i + 1].startsWith('--') && !Object.hasOwn(options, name), `invalid argument: ${argv[i]}`);
    options[name] = argv[i + 1];
  }
  validateOptions(options);
  return options;
}

export function validateOptions(options) {
  assert(/^[A-Z][A-Z0-9]+-\d+$/.test(options.ticket), 'invalid Jira ticket');
  for (const key of ['store', 'workspace']) {
    assert(typeof options[key] === 'string' && path.isAbsolute(options[key]), `--${key} must be absolute`);
  }
  return readStoreConfig(options.store);
}

function canonical(file) {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  return path.join(canonical(path.dirname(file)), path.basename(file));
}

export function freshWorkspace(options, config) {
  const workspace = canonical(options.workspace);
  const overlaps = (a, b) => a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`);
  // A configured local root is only a workspace-safety constraint. Transport
  // selection and every storage operation remain owned by task-packet-store.
  for (const protectedPath of [options.store, config.root].filter(Boolean)) {
    assert(!overlaps(workspace, canonical(protectedPath)), 'workspace must be separate from store configuration and persistent data');
  }
  assert(!fs.existsSync(workspace) || (fs.statSync(workspace).isDirectory() && fs.readdirSync(workspace).length === 0), 'workspace must be fresh and empty');
  fs.mkdirSync(workspace, { recursive: true });
}
