import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskMarkdown, serializeTaskFile, appendTaskLog } from '../src/pm/task.js';
const sample = `---
id: TASK-0001
title: "Hello"
status: todo
project: demo
created: 2026-01-31T00:00:00Z
updated: 2026-01-31T00:00:00Z
priority: P2
tags: [web, foo]
due: 2026-02-01
estimate: 2h
---

## Context
Test
`;
test('parseTaskMarkdown parses YAML frontmatter + body', () => {
    const t = parseTaskMarkdown(sample);
    assert.equal(t.meta.id, 'TASK-0001');
    assert.equal(t.meta.status, 'todo');
    assert.equal(t.meta.priority, 'P2');
    assert.deepEqual(t.meta.tags, ['web', 'foo']);
    assert.ok(t.body.includes('## Context'));
});
test('serializeTaskFile roundtrips basic content', () => {
    const t = parseTaskMarkdown(sample);
    const out = serializeTaskFile(t);
    assert.ok(out.includes('id: TASK-0001'));
    assert.ok(out.includes('## Context'));
});
test('appendTaskLog adds a Log section when missing', () => {
    const body = '\n## Context\nX\n';
    const out = appendTaskLog(body, 'did something', '2026-01-31T00:00:00Z');
    assert.ok(out.includes('## Log'));
    assert.ok(out.includes('- 2026-01-31T00:00:00Z did something'));
});
