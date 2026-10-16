/* The Coach conversation, end to end: the routes, the chat store, the real HTTP adapters and the
 * real undici fetch against a local provider that speaks each wire shape — JSON and SSE. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { tempData, writeState, sampleState } from './helpers.mjs';

process.env.COACH_CHAT_PER_MINUTE = '30';
const DIR = tempData();
const cfg = await import('../coach/config.js');
const store = await import('../coach/chat-store.js');
const { coachRoutes } = await import('../coach/routes.js');
const { toProviderMessages } = await import('../coach/core/chat-core.js');

/* ---------- a provider on localhost ---------- */
const seen = [];
const mode = { fail: 0, status: 0, hold: false };
const PIECES = ['Your bench ', 'is moving ', 'up.'];
const frame = o => 'data: ' + JSON.stringify(o) + '\n\n';
const streams = {
  '/v1/messages': () => [
    frame({ type: 'message_start', message: {} }),
    ...PIECES.map(t => frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    frame({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })
  ],
  '/v1/chat/completions': () => [...PIECES.map(t => frame({ choices: [{ delta: { content: t } }] })), frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }), 'data: [DONE]\n\n'],
  gemini: () => PIECES.map(t => frame({ candidates: [{ content: { parts: [{ text: t }] } }] }))
};
const jsonReply = url => {
  const t = PIECES.join('');
  if (url === '/v1/messages') return { content: [{ type: 'text', text: t }], stop_reason: 'end_turn' };
  if (url === '/v1/chat/completions') return { choices: [{ message: { content: t }, finish_reason: 'stop' }] };
  return { candidates: [{ content: { parts: [{ text: t }] }, finishReason: 'STOP' }] };
};
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const rec = { url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null };
    seen.push(rec);
    if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data: [{ id: 'm' }] })); }
    if (mode.status) { res.writeHead(mode.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'secret provider detail' } })); }
    if (mode.fail > 0) { mode.fail--; res.writeHead(529, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Overloaded' } })); }
    const gem = /:streamGenerateContent/.test(req.url);
    const wantsStream = rec.body && (rec.body.stream === true || gem);
    if (!wantsStream) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(jsonReply(gem ? 'gemini' : req.url))); }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const parts = (gem ? streams.gemini : streams[req.url])();
    if (mode.hold) { res.write(parts[1] || parts[0]); return; }   // one piece, then silence until cancelled
    parts.forEach(p => res.write(p));
    res.end();
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.closeAllConnections(); server.close(); });

/* ---------- the routes, driven like server.js drives them ---------- */
const admin = { id: 'admin', name: 'Admin' };
const mkRes = () => {
  const r = { status: 0, body: null, headers: {}, frames: [], headersSent: false, writableEnded: false, destroyed: false, _done: null };
  r.done = new Promise(res => { r._done = res; });
  r.writeHead = (code, h) => { r.status = code; r.headers = h; r.headersSent = true; };
  r.write = s => { r.frames.push(JSON.parse(String(s).replace(/^data: /, ''))); };
  r.end = () => { r.writableEnded = true; r._done(); };
  return r;
};
const routes = coachRoutes({
  json: (res, code, obj, h) => { res.status = code; res.body = obj; res.headers = h || {}; res._done(); },
  readBody: async req => req._body || {},
  readSession: req => req._user,
  requireAdmin: req => req._user
});
const call = async (route, body, user = admin) => {
  const res = mkRes();
  await routes[route]({ headers: {}, _body: body, _user: user }, res);
  return res;
};
// A streaming turn stays open until it ends: start it, and let the test act while it runs.
const open = (body, user = admin) => {
  const res = mkRes();
  routes['POST /api/coach/chat']({ headers: {}, _body: body, _user: user }, res).catch(e => { console.error('HANDLER', e); });
  return res;
};

async function setup(provider, uid = 'admin') {
  cfg.reset();
  cfg.save({ enabled: true, provider, authMode: 'instance', auth: {}, models: {}, boundUid: {}, log: [], caps: { instanceDaily: 0 }, providerOptions: { [provider]: { baseUrl: BASE } } });
  await call('POST /api/admin/coach/connect', { type: 'apikey', token: 'sk-chat-secret-1' });
  await call('POST /api/admin/coach/config', { model: 'the-model' });
  writeState(DIR, uid, sampleState());
  store.clearChat(uid);
  seen.length = 0; mode.fail = 0; mode.status = 0; mode.hold = false;
}
const posts = () => seen.filter(s => s.body);

test('JSON chat: free-text system prompt with the lifter data, no JSON mode, key only in the header, reply stored', async () => {
  await setup('anthropic');
  const r = await call('POST /api/coach/chat', { message: 'How is my bench going?', lang: 'en' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.message.text, 'Your bench is moving up.');
  const req = posts()[0];
  assert.equal(req.headers['x-api-key'], 'sk-chat-secret-1');
  assert.ok(!JSON.stringify(req.body).includes('sk-chat-secret'));
  assert.equal(req.body.model, 'the-model');
  assert.ok(!('stream' in req.body));
  assert.match(req.body.system[0].text, /chatting with one lifter/);
  assert.doesNotMatch(req.body.system[0].text, /return exactly the requested JSON/);
  assert.match(req.body.system[0].text, /"plan"/, 'the training summary rides along');
  assert.deepEqual(req.body.messages, [{ role: 'user', content: 'How is my bench going?' }]);
  assert.deepEqual(store.readChat('admin').map(m => m.role), ['user', 'coach']);
});

test('multi-turn: the second message carries the first exchange, and history is readable back', async () => {
  await setup('openai');
  await call('POST /api/coach/chat', { message: 'one' });
  await call('POST /api/coach/chat', { message: 'two' });
  const req = posts()[1];
  assert.equal(req.body.messages[0].role, 'system');
  assert.deepEqual(req.body.messages.slice(1).map(m => m.role), ['user', 'assistant', 'user']);
  assert.ok(!('response_format' in req.body), 'prose, not JSON mode');
  const h = await call('GET /api/coach/chat', null);
  assert.equal(h.body.messages.length, 4);
  assert.equal(h.body.busy, false);
  assert.equal(h.body.supported, true);
});

for (const provider of ['anthropic', 'openai', 'gemini']) {
  test(`streaming (${provider}): start, deltas in order, then done; the full reply is stored`, async () => {
    await setup(provider);
    const r = open({ message: 'hi', stream: true });
    await r.done;
    assert.equal(r.status, 200);
    assert.equal(r.headers['Content-Type'], 'text/event-stream');
    assert.equal(r.headers['X-Accel-Buffering'], 'no');
    assert.deepEqual(r.frames.map(f => f.type), ['start', 'delta', 'delta', 'delta', 'done']);
    assert.equal(r.frames.filter(f => f.type === 'delta').map(f => f.text).join(''), 'Your bench is moving up.');
    assert.equal(r.frames.at(-1).message.text, 'Your bench is moving up.');
    assert.equal(store.readChat('admin').at(-1).text, 'Your bench is moving up.');
  });
}

test('a transient provider status is retried before the turn fails', async () => {
  await setup('anthropic');
  mode.fail = 1;
  const r = await call('POST /api/coach/chat', { message: 'hi' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(posts().length, 2);
});

test('a provider refusal is a typed code; the provider detail never reaches the client', async () => {
  await setup('openai');
  mode.status = 401;
  const r = await call('POST /api/coach/chat', { message: 'hi' });
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'auth');
  assert.ok(!JSON.stringify(r.body).includes('secret provider detail'));
  assert.ok(!JSON.stringify(r.body).includes('sk-chat-secret'));
  assert.match(cfg.load().log.at(-1).detail, /secret provider detail/, 'the admin log has it');
});

test('cancel mid-stream keeps what was written as a partial and ends with a typed error', async () => {
  await setup('anthropic');
  mode.hold = true;
  const r = open({ message: 'hi', stream: true });
  while (!r.frames.some(f => f.type === 'delta')) await new Promise(x => setTimeout(x, 10));
  assert.equal((await call('GET /api/coach/chat', null)).body.busy, true);
  assert.equal((await call('POST /api/coach/chat/cancel', {})).body.cancelled, true);
  await r.done;
  const err = r.frames.at(-1);
  assert.equal(err.type, 'error');
  assert.equal(err.code, 'cancelled');
  assert.equal(err.partial, 'Your bench ');
  const last = store.readChat('admin').at(-1);
  assert.equal(last.partial, true);
  assert.equal((await call('GET /api/coach/chat', null)).body.busy, false);
});

test('one turn at a time, and the gates a job has: busy, consent, empty', async () => {
  await setup('anthropic');
  mode.hold = true;
  const first = open({ message: 'hi', stream: true });
  while (!first.frames.some(f => f.type === 'delta')) await new Promise(x => setTimeout(x, 10));
  assert.equal((await call('POST /api/coach/chat', { message: 'again' })).body.code, 'busy');
  await call('POST /api/coach/chat/cancel', {});
  await first.done;
  assert.equal((await call('POST /api/coach/chat', { message: '   ' })).body.code, 'empty');
  writeState(DIR, 'admin', sampleState({ coach: {} }));
  const r = await call('POST /api/coach/chat', { message: 'hi' });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'consent');
});

test('rate limit per profile answers 429 with Retry-After', async () => {
  await setup('anthropic', 'u-rate');
  const u = { id: 'u-rate' };
  let last;
  for (let i = 0; i < 32; i++) last = await call('POST /api/coach/chat', { message: 'm' + i }, u);
  assert.equal(last.status, 429);
  assert.equal(last.body.code, 'rate');
  assert.ok(+last.headers['Retry-After'] >= 1);
});

test('clear removes the conversation; history is bounded', async () => {
  await setup('anthropic');
  for (let i = 0; i < store.MAX_MESSAGES + 5; i++) store.appendChat('admin', { id: 'x' + i, role: 'user', text: 'm' + i, at: i });
  assert.equal(store.readChat('admin').length, store.MAX_MESSAGES);
  await call('POST /api/coach/chat/clear', {});
  assert.deepEqual(store.readChat('admin'), []);
});

test('the provider only ever sees a conversation that starts on a user turn', () => {
  const h = [{ role: 'coach', text: 'a' }, { role: 'user', text: 'b' }, { role: 'coach', text: 'c' }];
  assert.deepEqual(toProviderMessages(h), [{ role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }]);
});
