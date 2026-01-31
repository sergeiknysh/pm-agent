import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { TaskRepo } from '../src/pm/repo.js';
import { buildKanbanSummary, buildMvpProgress } from '../src/pm/report.js';

test('buildKanbanSummary returns counts for vextaibot', async () => {
  const pmRoot = path.join(process.cwd(), 'pm');
  const repo = new TaskRepo({ pmRoot });
  const sum = await buildKanbanSummary(repo, 'vextaibot');
  assert.equal(sum.project, 'vextaibot');
  assert.ok(sum.counts.todo + sum.counts.doing + sum.counts.blocked + sum.counts.done >= 1);
});

test('buildMvpProgress returns A/B/C for vextaibot', async () => {
  const pmRoot = path.join(process.cwd(), 'pm');
  const repo = new TaskRepo({ pmRoot });
  const iters = await buildMvpProgress(repo, 'vextaibot', { useWeights: true });
  const keys = iters.map((i) => i.key);
  assert.deepEqual(keys, ['A', 'B', 'C']);
  for (const it of iters) {
    assert.ok(it.percent >= 0 && it.percent <= 100);
  }
});
