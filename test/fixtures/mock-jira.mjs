// Test-only preload, copied into an isolated installation by the artifact smoke.
// The real installed exporter CLI, reader, templates, and store still execute.
import assert from 'node:assert/strict';
import fs from 'node:fs';

if (process.argv.includes('--issue-keys')) {
  assert(!Object.keys(process.env).some((key) => key.startsWith('PACKET_STORE_') || key.startsWith('RCLONE_')));
  const { default: axios } = await import('axios');
  const issue = JSON.parse(fs.readFileSync(new URL('./issue.json', import.meta.url), 'utf8'));
  const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const raw = { key: issue.key, fields: {
    summary: issue.summary, description: adf(issue.description), status: { name: issue.status },
    issuetype: { name: issue.issueType }, priority: { name: issue.priority },
    assignee: { displayName: issue.assignee }, reporter: { displayName: issue.reporter },
    created: issue.created, updated: issue.updated, labels: issue.labels,
    attachment: issue.attachments.map((item) => ({ ...item, author: { displayName: item.author }, content: item.contentUrl })),
  } };
  const comments = issue.comments.map((item) => ({ ...item, body: adf(item.body), author: { displayName: item.author } }));
  axios.defaults.adapter = async (config) => {
    assert.equal(config.method.toUpperCase(), 'GET');
    const url = new URL(axios.getUri(config));
    assert.equal(url.origin, 'https://example.atlassian.net');
    const body = url.pathname === `/rest/api/3/issue/${issue.key}` ? raw
      : url.pathname === `/rest/api/3/issue/${issue.key}/comment` ? { comments, total: comments.length }
      : assert.fail(`unexpected Jira request: ${url.pathname}`);
    return { status: 200, statusText: 'OK', data: body, headers: {}, config };
  };
  globalThis.fetch = async (input) => {
    assert.equal(String(input), 'https://example.atlassian.net/rest/api/3/attachment/content/20001?redirect=false');
    return new Response('fixture design\n', { status: 200 });
  };
}
