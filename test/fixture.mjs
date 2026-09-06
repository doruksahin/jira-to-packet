import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportJiraMarkdown } from '@doruksahin/jira-markdown-exporter';

export const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
export const issue = read(new URL('./fixtures/jira-to-packet/issue.json', import.meta.url));

export function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-to-packet-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = path.join(directory, 'store.json');
  write(store, { driver: 'fs', root: path.join(directory, 'persistent') });
  return { directory, store, ticket: issue.key, workspace: path.join(directory, 'producer') };
}

export function fixtureExporter({ downloadAttachment, issueOverrides, transformReceipt } = {}) {
  return async ({ ticket, exportRoot, receipt, profile }) => {
    const selected = { ...issue, ...issueOverrides };
    const result = await exportJiraMarkdown({
      host: 'https://example.atlassian.net', email: 'fixture@example.test', apiToken: 'fixture-only',
      issueKeys: [ticket], outputDir: exportRoot, downloadAttachments: true,
      outputProfile: { directory: profile, manifest: read(path.join(profile, 'profile.json')) },
    }, { reader: {
      searchIssueKeys: async () => [ticket], fetchIssue: async () => selected,
      downloadAttachment: downloadAttachment ?? (async () => Buffer.from('fixture design\n')),
    } });
    write(receipt, transformReceipt ? transformReceipt(result) : result);
  };
}
