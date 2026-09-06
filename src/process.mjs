import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Public entrypoints resolve correctly under npm and pnpm, even when package.json
// is not exported. Read the installed package's declared executable at that root.
export function dependencyExecutable(packageName, executable) {
  let directory = path.dirname(fileURLToPath(import.meta.resolve(packageName)));
  while (true) {
    const manifestFile = path.join(directory, 'package.json');
    if (fs.existsSync(manifestFile)) {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      if (manifest.name === packageName) {
        const relative = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[executable];
        if (!relative) throw new Error(`${packageName} does not provide ${executable}`);
        return path.resolve(directory, relative);
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`cannot locate installed ${packageName}`);
    directory = parent;
  }
}

export function withoutStorageCredentials(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) =>
    !key.startsWith('PACKET_STORE_') && !key.startsWith('RCLONE_')));
}

export function runDependency(packageName, executable, args, env = process.env) {
  const result = spawnSync(process.execPath, [dependencyExecutable(packageName, executable), ...args], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env,
  });
  if (result.status !== 0) {
    // Child receipts retain detailed diagnostics. Never reflect arbitrary child
    // output, which can contain upstream URLs, task text, or credential values.
    throw new Error(`${executable} failed (${result.error?.code ?? result.status ?? result.signal})`);
  }
  return result.stdout;
}

export function storeCommand(args) {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('JIRA_')));
  return JSON.parse(runDependency('@doruksahin/task-packet-store', 'task-packet-store', args, environment));
}
