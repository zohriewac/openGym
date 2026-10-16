/* The Coach as a conversation: one turn in, one reply out (streamed when the provider can).
 *
 * A turn is a single provider call made straight from the request — no queue, because the
 * answer is seconds, not minutes — under the same gates as a job: consent, whose account pays,
 * the instance's daily cap. On top of those, one turn at a time per profile and a per-profile
 * rate window. The profile's training summary rides in the system message (the payload builder
 * the jobs use, so what leaves the server is what the consent screen lists); the history is the
 * file chat-store.js keeps.
 */
import os from 'node:os';
import crypto from 'node:crypto';
import * as cfgStore from './config.js';
import * as jobs from './jobs.js';
import { adapterFor } from './adapters/index.js';
import * as payloadLib from './core/payload.js';
import { chatSystem, toProviderMessages, CHAT_MAX_TOKENS } from './core/chat-core.js';
import { handleFor } from './handle.js';
import { fetchFor } from './node-fetch.js';
import { createWindow } from '../rate-limit.js';
import { readChat, appendChat, epochOf, isActive, setActive } from './chat-store.js';

const { CoachError } = jobs;
const rate = createWindow({ max: +process.env.COACH_CHAT_PER_MINUTE || 10, windowMs: 60000 });

/** Chat needs a provider that answers in prose over HTTPS; the runtime-backed ones are job-only. */
export const supported = () => adapterFor(cfgStore.load().provider)?.chat instanceof Function;

/** Provider failure → the class the app maps to a sentence. The raw words never leave (admin card only). */
export function classify(r) {
  if (r.cancelled) return 'cancelled';
  if (r.timedOut) return 'timeout';
  if (r.spawnError) return 'missing';
  return /auth|unauthor|api key|credential|token|401|403/i.test(r.stderr || '') ? 'auth' : 'provider';
}

function contextFor(uid, S, lang) {
  const payload = payloadLib.build(S, {
    handle: handleFor(uid), kind: 'review', note: null, cohort: null,
    lang: lang || (S.langAuto === true ? payloadLib.langTag(process.env.DEFAULT_LANG) : null)
  });
  const system = chatSystem(payload);
  if (!system) throw new CoachError('toolarge', 'your training data is too large to send');
  return system;
}

function admit(uid, text) {
  if (!text) throw new CoachError('empty', 'nothing to send');
  const wait = rate.take(uid);
  if (wait) throw Object.assign(new CoachError('rate', 'too many messages, slow down'), { retryAfter: wait });
  if (isActive(uid)) throw new CoachError('busy', 'the Coach is already answering');
}

/** What the turn needs from the world, or the CoachError that says why not. */
function prepare(uid, text, lang) {
  admit(uid, text);
  const S = jobs.authorize(uid);
  const adapter = adapterFor(cfgStore.load().provider);
  if (!adapter || !supported()) throw new CoachError('unsupported', 'this provider does not do chat');
  jobs.chargeInstance();
  return { adapter, system: contextFor(uid, S, lang) };
}

function record(uid, epoch, msg) {
  // Forgotten while it ran: the profile's record is gone and stays gone.
  if (epochOf(uid) === epoch) appendChat(uid, msg);
}

/**
 * Run one turn. `onStart(id)` then `onDelta(text)` fire as it goes (streaming); the promise
 * resolves with the stored reply or rejects with a CoachError carrying `partial` text, if any.
 */
export async function send(uid, { message, lang, onStart, onDelta }) {
  const text = String(message || '').trim().slice(0, cfgStore.load().maxMessageLen || 1000);
  const { adapter, system } = prepare(uid, text, lang);
  const cfg = cfgStore.load(), epoch = epochOf(uid), started = Date.now();
  const ctl = new AbortController();
  setActive(uid, ctl);
  try {
    record(uid, epoch, { id: crypto.randomBytes(6).toString('hex'), role: 'user', text, at: Date.now() });
    const id = crypto.randomBytes(6).toString('hex');
    if (onStart) onStart(id);
    const r = await adapter.chat({
      cfg, system, messages: toProviderMessages(readChat(uid)), model: cfgStore.modelFor(cfg),
      env: cfgStore.jobEnv(os.tmpdir(), cfgStore.credentialFor(uid)), timeoutMs: jobs.TIMEOUT_MS,
      fetch: fetchFor(jobs.TIMEOUT_MS), signal: ctl.signal, maxTokens: Math.min(cfg.maxOutputTokens || CHAT_MAX_TOKENS, CHAT_MAX_TOKENS)
    }, onDelta);
    const ms = Date.now() - started;
    if (r.code !== 0 || !r.text) return fail(uid, epoch, id, r, ms);
    const reply = { id, role: 'coach', text: r.text, at: Date.now() };
    record(uid, epoch, reply);
    cfgStore.logJob({ at: new Date().toISOString(), uid, kind: 'chat', trigger: 'manual', outcome: 'ready', errorClass: null, ms, detail: null });
    return reply;
  } finally { setActive(uid, null); }
}

function fail(uid, epoch, id, r, ms) {
  const code = r.code === 0 ? 'unusable' : classify(r);
  if (r.text) record(uid, epoch, { id, role: 'coach', text: r.text, at: Date.now(), partial: true });
  cfgStore.logJob({ at: new Date().toISOString(), uid, kind: 'chat', trigger: 'manual', outcome: 'failed', errorClass: code, ms, detail: String(r.stderr || '').slice(0, 300) || null });
  throw Object.assign(new CoachError(code, code), { partial: r.text || '' });
}

/** What GET /api/coach/chat answers. */
export const view = uid => ({ messages: readChat(uid), busy: isActive(uid), supported: supported(), maxMessageLen: cfgStore.load().maxMessageLen });
