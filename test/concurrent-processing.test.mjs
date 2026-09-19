import test from 'node:test';
import assert from 'node:assert/strict';
import { forEachConcurrent } from '../src/lib/forEachConcurrent.ts';

test('receipt processing finishes every receipt and never exceeds two workers', async () => {
  let running = 0, peak = 0;
  const completed = [];
  await forEachConcurrent([0,1,2,3,4], 2, async (item) => {
    running++; peak = Math.max(peak, running);
    await new Promise(resolve => setTimeout(resolve, 5));
    completed.push(item); running--;
  });
  assert.equal(peak, 2);
  assert.deepEqual(completed.sort(), [0,1,2,3,4]);
});

test('failure waits for active workers before responding', async () => {
  let otherFinished = false;
  await assert.rejects(forEachConcurrent([0,1], 2, async (item) => {
    if (item === 0) throw new Error('analysis failed');
    await new Promise(resolve => setTimeout(resolve, 5));
    otherFinished = true;
  }), /analysis failed/);
  assert.equal(otherFinished, true);
});
