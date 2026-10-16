/* A phone that locks mid-request loses the connection, not the job. The job is owned by the
   server, the answer waits in the profile's file, and a repeated start (same requestId) finds
   the job it already started instead of spending a second provider call. */
import './clock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData, writeState, sampleState } from './helpers.mjs';

const DIR = tempData();
const cfg = await import('../coach/config.js');
const jobs = await import('../coach/jobs.js');
const { coachRoutes } = await import('../coach/routes.js');
const { forcePrivilegeVerdict } = await import('../coach/adapters/spawn.js');

cfg.save({ enabled: true, provider: 'fixture' });
forcePrivilegeVerdict({ ok: true, dropped: false, why: 'pinned by the test suite' });

const settle = async uid => {
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    if (!jobs.status(uid).job) return jobs.status(uid);
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error('job never finished');
};
const routesFor = uid => {
  const r = coachRoutes({
    json: (res, status, body) => { res.status = status; res.body = body; },
    readBody: async req => req.body || {}, readSession: () => ({ id: uid }), requireAdmin: () => true
  });
  return async (key, body) => { const res = {}; await r[key]({ body }, res); return res; };
};

test('the start answers 202 and the job finishes though the client never comes back', async () => {
  const uid = 'u-gone';
  writeState(DIR, uid, sampleState());
  const res = await routesFor(uid)('POST /api/coach/review', { requestId: 'r-gone' });
  assert.equal(res.status, 202);
  // The caller is gone: nothing reads the response and nothing polls until the run is over.
  await new Promise(r => setTimeout(r, 300));
  const s = await settle(uid);
  assert.equal(s.last.outcome, 'ready');
  assert.ok(s.pending, 'the proposal waits for the client that comes back');
});

test('starting the same request twice returns the running job, then the finished one', async () => {
  const uid = 'u-dup';
  writeState(DIR, uid, sampleState());
  const before = cfg.load().daily?.count || 0;
  const a = jobs.enqueue(uid, { kind: 'review', requestId: 'r-1' });
  const b = jobs.enqueue(uid, { kind: 'review', requestId: 'r-1' });
  assert.equal(b.id, a.id);
  assert.throws(() => jobs.enqueue(uid, { kind: 'review', requestId: 'r-2' }), e => e.code === 'busy');
  await settle(uid);
  assert.equal(jobs.enqueue(uid, { kind: 'review', requestId: 'r-1' }).id, a.id, 'a retry after the end finds the result');
  assert.equal(jobs.status(uid).job, null, 'and starts nothing');
  assert.equal(cfg.load().daily.count - before, 1, 'one provider call counted');
});

test('another profile never sees or collides with the job', async () => {
  writeState(DIR, 'u-a', sampleState());
  writeState(DIR, 'u-b', sampleState());
  const a = jobs.enqueue('u-a', { kind: 'review', requestId: 'same' });
  await settle('u-a');
  assert.equal(jobs.status('u-b').last, null);
  const b = jobs.enqueue('u-b', { kind: 'review', requestId: 'same' });
  assert.notEqual(b.id, a.id, 'the id is scoped to the profile');
  await settle('u-b');
  assert.equal(jobs.status('u-b').last.id, b.id);
});

test('a repeated requestId does not get around the instance cap', async () => {
  writeState(DIR, 'u-cap', sampleState());
  cfg.save({ caps: { instanceDaily: 1 }, daily: { date: new Date().toISOString().slice(0, 10), count: 1 } });
  try {
    assert.throws(() => jobs.enqueue('u-cap', { kind: 'review', requestId: 'r-cap' }), e => e.code === 'cap');
  } finally { cfg.save({ caps: { instanceDaily: 0 } }); }
});
