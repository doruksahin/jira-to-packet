#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  calculateOutputProfileDigest,
  JIRA_MARKDOWN_EXPORTER_VERSION,
  parseExportReceipt,
} from '@doruksahin/jira-markdown-exporter';
import YAML from 'yaml';

const SAFE_TICKET = /^[A-Z][A-Z0-9]+-\d+$/;
const TEMPLATE_SUFFIX = '.tmpl';

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const names = new Set(['--ticket', '--export-root', '--receipt', '--profile', '--template']);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!names.has(name) || value === undefined || value.startsWith('--')) {
      fail(
        'Usage: prepare-task-packet.mjs --ticket <TICKET> --export-root <absolute-dir> --receipt <absolute-json> --profile <absolute-dir> --template <absolute-dir>',
      );
    }
    if (Object.hasOwn(result, name)) fail(`duplicate argument: ${name}`);
    result[name] = value;
  }
  if (Object.keys(result).length !== names.size)
    fail(`missing required argument: ${[...names].find((name) => !Object.hasOwn(result, name))}`);
  return {
    ticket: result['--ticket'],
    exportRoot: absolute(result['--export-root'], '--export-root'),
    receipt: absolute(result['--receipt'], '--receipt'),
    profile: absolute(result['--profile'], '--profile'),
    template: absolute(result['--template'], '--template'),
  };
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

function regularFile(file, label) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file: ${file}`);
}

function directory(file, label) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a real directory: ${file}`);
}

function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) fail(`${file}: missing YAML frontmatter`);
  const document = YAML.parseDocument(match[1], { uniqueKeys: true });
  if (document.errors.length > 0) fail(`${file}: invalid YAML frontmatter: ${document.errors[0].message}`);
  const value = document.toJS();
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${file}: frontmatter must be a mapping`);
  return value;
}

function scalar(value) {
  return JSON.stringify(String(value));
}

function renderTemplate(text, values, file) {
  for (const match of text.matchAll(/{{([^}]+)}}/g)) {
    const token = match[0];
    const name = match[1];
    if (!Object.hasOwn(values, name)) fail(`${file}: unknown template token ${token}`);
  }
  const rendered = text.replace(/{{([a-z_]+)}}/g, (_token, name) => {
    return values[name];
  });
  return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

function templateFiles(root, relative = '') {
  const current = relative ? path.join(root, relative) : root;
  return fs
    .readdirSync(current, { withFileTypes: true })
    .flatMap((entry) => {
      const child = relative ? path.posix.join(relative, entry.name) : entry.name;
      if (entry.isSymbolicLink()) fail(`packet template must not contain symbolic links: ${child}`);
      if (entry.isDirectory()) return templateFiles(root, child);
      if (!entry.isFile() || !entry.name.endsWith(TEMPLATE_SUFFIX))
        fail(`packet template must contain only ${TEMPLATE_SUFFIX} files: ${child}`);
      return [child];
    })
    .sort();
}

function writeTemplates(templateRoot, packetRoot, values) {
  const written = [];
  for (const relative of templateFiles(templateRoot)) {
    const output = relative.slice(0, -TEMPLATE_SUFFIX.length);
    const destination = path.join(packetRoot, ...output.split('/'));
    if (fs.existsSync(destination)) fail(`refusing to replace existing packet file: ${destination}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(
      destination,
      renderTemplate(fs.readFileSync(path.join(templateRoot, relative), 'utf8'), values, relative),
      { flag: 'wx' },
    );
    written.push(output);
  }
  return written;
}

export async function prepareTaskPacket(options) {
  if (!SAFE_TICKET.test(options.ticket)) fail(`invalid Jira ticket: ${options.ticket}`);
  directory(options.exportRoot, '--export-root');
  directory(options.profile, '--profile');
  directory(options.template, '--template');
  regularFile(options.receipt, '--receipt');

  const packetRoot = path.join(options.exportRoot, options.ticket);
  const jiraRoot = path.join(packetRoot, 'jira');
  directory(packetRoot, 'exported issue directory');
  directory(jiraRoot, 'exporter-owned Jira directory');

  const receipt = parseExportReceipt(readJson(options.receipt, 'export receipt'));
  if (receipt.exporterVersion !== JIRA_MARKDOWN_EXPORTER_VERSION) {
    fail(
      `export receipt version ${receipt.exporterVersion} does not match installed exporter ${JIRA_MARKDOWN_EXPORTER_VERSION}`,
    );
  }
  if (receipt.status !== 'success' || receipt.total !== 1 || receipt.synced !== 1 || receipt.failed !== 0) {
    fail('export receipt must report one successfully synced issue and no failures');
  }
  if (path.resolve(receipt.outputDir) !== options.exportRoot)
    fail('export receipt outputDir does not match --export-root');
  const issue = receipt.issues[0];
  if (issue?.status !== 'synced' || issue.key !== options.ticket || path.resolve(issue.issueDir) !== jiraRoot) {
    fail('export receipt issue does not identify the expected ticket and Jira directory');
  }
  if (issue.downloadedAttachments !== issue.attachments || issue.warnings.length > 0) {
    fail(
      `export receipt has incomplete attachments: expected ${issue.attachments}, downloaded ${issue.downloadedAttachments}, warnings ${issue.warnings.length}`,
    );
  }

  const manifestFile = path.join(options.profile, 'profile.json');
  regularFile(manifestFile, 'profile manifest');
  const manifest = readJson(manifestFile, 'profile manifest');
  const profileDigest = await calculateOutputProfileDigest({ directory: options.profile, manifest });
  if (
    manifest.id !== receipt.profileId ||
    manifest.ownedDirectory !== 'jira' ||
    profileDigest !== receipt.profileDigest
  ) {
    fail('export receipt profile provenance does not match the repository-owned Jira profile');
  }

  const issueFile = path.join(jiraRoot, '00 Issue.md');
  regularFile(issueFile, 'generated Jira issue');
  const source = frontmatter(issueFile);
  if (source.type !== 'jira-generated-issue' || source.jira_key !== options.ticket) {
    fail(`${issueFile}: generated Jira identity does not match ${options.ticket}`);
  }
  const jiraUrl = String(source.jira_url ?? '');
  const jiraTitle = String(source.jira_title ?? '').trim();
  if (!jiraUrl.endsWith(`/browse/${options.ticket}`) || !jiraTitle) fail(`${issueFile}: Jira URL or title is invalid`);

  const values = {
    jira_key: scalar(options.ticket),
    jira_title: scalar(jiraTitle),
    jira_title_text: jiraTitle,
    jira_url: scalar(jiraUrl),
    jira_url_text: jiraUrl,
    jira_updated: scalar(source.jira_updated ?? ''),
    generated_by: scalar(`jira-markdown-exporter@${receipt.exporterVersion}`),
    profile_id: scalar(receipt.profileId),
    profile_digest: scalar(receipt.profileDigest),
  };
  const written = writeTemplates(options.template, packetRoot, values);
  return {
    ticket: options.ticket,
    packetDirectory: packetRoot,
    exporterVersion: receipt.exporterVersion,
    profileId: receipt.profileId,
    profileDigest,
    written,
  };
}

async function main() {
  try {
    const result = await prepareTaskPacket(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`PACKET_PREPARATION_FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
