// The Coach, on a phone that brings its own API key.
//
// No server. The pipeline the server runs — payload allowlist, prompt, provider call, parser,
// validator, one repair round — is imported from api/coach/core and run here, in-process, so
// the phone gets exactly the code the server has and not a second opinion of it. The apply
// engine, staleness, snapshot/revert and the log are the ones every build already uses.
//
// This module is the one static importer of the core, which makes `import('./coach-local.js')`
// the whole lazy chunk: the exercise catalogue, the prompts and the validator arrive together
// and only after the user chose this mode. coach-api.js dispatches here the same way it
// dispatches to the demo provider, so the screens never learn that there is no server.
//
// What is different from the server, and on purpose:
//   - the user pays. There is no cfg.caps to lean on, so a local daily cap is not optional.
//   - the pseudonym is drawn at random once and kept, rather than derived from a secret.
//   - a proposal waits in the device file, not in S, so it survives an app kill without
//     riding into a backup or a sync.
import * as payloadLib from '../../../api/coach/core/payload.js'
import { runPipeline } from '../../../api/coach/core/pipeline.js'
import { chatSystem, toProviderMessages, CHAT_MAX_TOKENS } from '../../../api/coach/core/chat-core.js'
import { HTTP_PROVIDERS, baseUrlFor } from '../../../api/coach/core/providers.js'
import anthropic from '../../../api/coach/core/adapters/anthropic.js'
import openai from '../../../api/coach/core/adapters/openai.js'
import gemini from '../../../api/coach/core/adapters/gemini.js'
import compatible from '../../../api/coach/core/adapters/compatible.js'
import openrouter from '../../../api/coach/core/adapters/openrouter.js'
import { nativeFetch } from './capacitor-fetch.js'
import { getApiKey } from './coach-secrets.js'
import { loadCoachDevice, saveCoachDevice } from './coach-device.js'
import { planHash } from './coach.js'
import { todayISO } from './format.js'
import { t, getLang } from './i18n.js'

export const ADAPTERS = { anthropic, openai, gemini, openrouter, compatible }
// Five minutes is right for a cloud API and wrong for a model on somebody's laptop; the
// OpenAI-compatible endpoint is the one that may be local, so it gets the long budget.
export const TIMEOUT_MS = 5 * 60000
export const LOCAL_ENDPOINT_TIMEOUT_MS = 25 * 60000
export const timeoutFor = provider => (provider === 'compatible' ? LOCAL_ENDPOINT_TIMEOUT_MS : TIMEOUT_MS)
const PENDING_DAYS = 14
const HANDLE_LENGTH = 16

let job = null
let ctl = null    // aborts the provider call of the run in flight
let lastError = null
let last = null   // how the most recent job ended — the same shape the server's status() reports
// Reported to the screens through the same status shape the server answers with; a toast is
// also raised because on the server a failed job lands in the admin card, and here there is
// no admin card — the user is the operator.
let notify = null
export function setNotifier(fn) { notify = fn }

/* ---------- what this phone is configured with ---------- */

const cfgOf = d => ({ provider: d.provider, providerOptions: d.baseUrl ? { [d.provider]: { baseUrl: d.baseUrl } } : {} })
const envOf = (d, key) => (key ? { [HTTP_PROVIDERS[d.provider].apiKeyEnv]: key } : {})

function mintHandle() {
  const bytes = new Uint8Array(12)
  ;(globalThis.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256) })
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, HANDLE_LENGTH)
}
async function handle() {
  const d = await loadCoachDevice()
  if (d.handle && d.handle.length === HANDLE_LENGTH) return d.handle
  const h = mintHandle()
  await saveCoachDevice({ handle: h })
  return h
}

/* ---------- the API surface coach-api.js dispatches to ---------- */

export async function localStatus() {
  const d = await loadCoachDevice()
  if (d.pending && d.pending.expiresAt && d.pending.expiresAt < Date.now()) await saveCoachDevice({ pending: null })
  return { job, pending: (await loadCoachDevice()).pending || null, lastError, last }
}

export const localReview = (S, note) => start(S, 'review', { note: note ? String(note).slice(0, 1000) : null })
export const localPlan = (S, intake) => start(S, 'create', { intake: intake || null })
export const localRefine = async (S, text) => {
  const d = await loadCoachDevice()
  const pendingCreate = d.pending && d.pending.kind === 'create' ? d.pending : null
  return start(S, 'create', { refine: String(text || '').slice(0, 1000), previous: pendingCreate?.bundle || null, iteration: (pendingCreate?.iteration || 1) + 1 })
}
export const localDebrief = (S, workoutId) => start(S, 'debrief', { workoutId: workoutId || null })
export async function localResolve() { await saveCoachDevice({ pending: null }); return { ok: true } }
export async function localForget() { job = null; lastError = null; await saveCoachDevice({ pending: null, daily: null }); return { ok: true } }

export async function localDisclosure() {
  const d = await loadCoachDevice()
  const meta = HTTP_PROVIDERS[d.provider] || {}
  const base = d.provider ? baseUrlFor(d.provider, cfgOf(d)) : ''
  return {
    provider: d.provider, providerLabel: meta.label || t('the configured AI provider'),
    categories: payloadLib.DATA_CATEGORIES, version: 1,
    // The honest difference from the self-hosted flow: it is the user's own account.
    payer: 'you', host: hostOf(base)
  }
}

/** The models the configured endpoint serves — the setup screen's list, and its reachability test. */
export async function localModels(settings, key) {
  const adapter = ADAPTERS[settings.provider]
  if (!adapter) return { ok: false, error: 'unknown provider', models: [] }
  return adapter.models(cfgOf(settings), envOf(settings, key), { fetch: nativeFetch, timeoutMs: 20000 })
}

/** Credit left on the account, for a provider that reports one (OpenRouter). */
export async function localBalance(settings, key) {
  const adapter = ADAPTERS[settings.provider]
  if (!adapter) return { ok: false, error: 'unknown provider' }
  return adapter.balance(cfgOf(settings), envOf(settings, key), { fetch: nativeFetch, timeoutMs: 20000 })
}

const hostOf = url => { try { return new URL(url).host } catch { return url || '' } }

/* ---------- running a job ---------- */

async function start(S, kind, opts) {
  if (job) throw Object.assign(new Error(t('The Coach is already thinking about your training.')), { status: 409, code: 'busy' })
  if (!S?.coach?.consent?.agreedAt) throw Object.assign(new Error(t('The Coach needs your go-ahead first.')), { status: 403, code: 'consent' })
  const d = await loadCoachDevice()
  const adapter = ADAPTERS[d.provider]
  if (d.mode !== 'byok' || !adapter) throw Object.assign(new Error(t('The Coach isn’t set up on this phone.')), { status: 503, code: 'off' })

  ctl = new AbortController()
  job = { id: 'local-' + Date.now().toString(36), kind, state: 'running', startedAt: Date.now() }
  lastError = null
  // Not awaited: the screens poll, exactly as they do against a server.
  run(S, kind, opts, d, adapter).catch(e => { lastError = { errorClass: 'internal', detail: String(e && e.message || e) } }).finally(() => { job = null })
  return { job }
}

async function run(S, kind, opts, d, adapter) {
  const key = await getApiKey()
  const payload = payloadLib.build(S, {
    handle: await handle(), kind, intake: opts.intake, note: opts.note, refine: opts.refine, previous: opts.previous, workoutId: opts.workoutId,
    lang: getLang()   // what the app shows, which a profile that never picked a language does not store (#303)
  })
  const attempt = await runPipeline({
    adapter, cfg: cfgOf(d), kind, payload,
    model: d.model || HTTP_PROVIDERS[d.provider].defaultModel, timeoutMs: timeoutFor(d.provider),
    invokeOpts: { env: envOf(d, key), fetch: nativeFetch, signal: ctl.signal }
  })
  if (!attempt.ok) {
    // There is no admin card on a phone, so the reason has to reach the person holding it:
    // the provider's own words for a refusal, the validator's for an answer that did not fit.
    const detail = attempt.detail || (Array.isArray(attempt.errors) && attempt.errors.length
      ? attempt.errors.slice(0, 3).map(String).join(' · ').slice(0, 300)
      : null)
    lastError = { errorClass: attempt.errorClass, detail }
    last = { id: job.id, kind, outcome: 'failed', errorClass: attempt.errorClass, at: Date.now() }
    if (notify) notify({ kind: 'failed', errorClass: attempt.errorClass, detail })
    return
  }
  if (attempt.nochange) {
    last = { id: job.id, kind, outcome: 'nochange', errorClass: null, at: Date.now(), reading: attempt.reading }
    if (notify) notify({ kind: 'nochange', reading: attempt.reading })
    return
  }
  const pending = {
    id: job.id, kind, createdAt: Date.now(), expiresAt: Date.now() + PENDING_DAYS * 86400000,
    planHash: planHash(S), iteration: opts.iteration || 1,
    ...(kind === 'debrief' ? { workout: workoutMetaOf(S, opts.workoutId) } : {}),
    ...attempt.result
  }
  await saveCoachDevice({ pending })
  last = { id: job.id, kind, outcome: 'ready', errorClass: null, at: Date.now() }
  if (notify) notify({ kind: 'ready', pending })
}

// The session a debrief is about, in the shape the card reads. The core builds it for the
// server; the fallback covers a core that predates it.
function workoutMetaOf(S, workoutId) {
  if (typeof payloadLib.workoutMeta === 'function') return payloadLib.workoutMeta(S, workoutId)
  const all = (S.workouts || []).filter(w => w && w.d)
  const w = all.find(x => x.id === workoutId) || all[all.length - 1]
  return w ? { id: w.id, d: w.d, name: w.name || null } : null
}

/* ---------- the conversation ----------
   The same turn the server runs (api/coach/chat.js), on this phone: history in the device file,
   the provider called directly, today's count against a cap of its own (a chat is many small
   calls, and the job cap of ten would end it after one afternoon). */
export const LOCAL_CHAT_DAILY_CAP = 60
const CHAT_KEEP = 40
let chatCtl = null

const chatErr = (message, code, status) => Object.assign(new Error(message), { code, status })
const chatStamp = () => Math.random().toString(36).slice(2, 10)

export async function localChatHistory() {
  const d = await loadCoachDevice()
  return { messages: d.chat || [], busy: !!chatCtl, supported: true, maxMessageLen: 1000 }
}
export function localChatCancel() { const c = chatCtl; if (c) c.abort(); return { ok: true, cancelled: !!c } }
export async function localChatClear() { await saveCoachDevice({ chat: [] }); return { ok: true } }

async function chatAllowed(S) {
  if (chatCtl) throw chatErr(t('The Coach is already thinking about your training.'), 'busy', 409)
  if (!S?.coach?.consent?.agreedAt) throw chatErr(t('The Coach needs your go-ahead first.'), 'consent', 403)
  const d = await loadCoachDevice()
  const adapter = ADAPTERS[d.provider]
  if (d.mode !== 'byok' || !adapter) throw chatErr(t('The Coach isn’t set up on this phone.'), 'off', 503)
  const used = d.chatDaily && d.chatDaily.d === todayISO() ? d.chatDaily.n : 0
  if (used >= LOCAL_CHAT_DAILY_CAP) throw chatErr(t('The Coach is taking a breather. You’ve used today’s {0} runs on this phone.', LOCAL_CHAT_DAILY_CAP), 'cap', 429)
  await saveCoachDevice({ chatDaily: { d: todayISO(), n: used + 1 } })
  return { d, adapter }
}

const chatCode = r => r.cancelled ? 'cancelled' : r.timedOut ? 'timeout' : r.code !== 0 ? (/auth|401|403|api key/i.test(r.stderr || '') ? 'auth' : 'provider') : !r.text ? 'unusable' : null

export async function localChatSend(S, message, { onStart, onDelta, signal } = {}) {
  const text = String(message || '').trim().slice(0, 1000)
  if (!text) throw chatErr(t('There’s nothing to send.'), 'empty', 400)
  const { d, adapter } = await chatAllowed(S)
  const abort = chatCtl = new AbortController()
  if (signal) signal.addEventListener('abort', () => abort.abort(), { once: true })
  try {
    const system = chatSystem(payloadLib.build(S, { handle: await handle(), kind: 'review', note: null, lang: getLang() }))
    if (!system) throw chatErr(t('Your training data is too large to send.'), 'toolarge', 413)
    const history = [...(d.chat || []), { id: chatStamp(), role: 'user', text, at: Date.now() }].slice(-CHAT_KEEP)
    await saveCoachDevice({ chat: history })
    const id = chatStamp()
    if (onStart) onStart(id)
    const r = await adapter.chat({
      cfg: cfgOf(d), system, messages: toProviderMessages(history), model: d.model || HTTP_PROVIDERS[d.provider].defaultModel,
      env: envOf(d, await getApiKey()), fetch: nativeFetch, timeoutMs: timeoutFor(d.provider), signal: abort.signal, maxTokens: CHAT_MAX_TOKENS
    }, onDelta)
    const code = chatCode(r)
    const reply = { id, role: 'coach', text: r.text || '', at: Date.now(), ...(code ? { partial: true } : {}) }
    if (reply.text) await saveCoachDevice({ chat: [...history, reply].slice(-CHAT_KEEP) })
    // The person holding the phone is the operator: the provider's own words go with the failure.
    if (code) throw Object.assign(chatErr(String(r.stderr || code).slice(0, 300), code, 0), { partial: r.text || '' })
    return { message: reply }
  } finally { chatCtl = null }
}

// Test seam.
/** The app is back on screen. A request the OS suspended may never answer (the native bridge keeps
 *  its promise pending), which would leave "thinking…" up and refuse every new ask as busy. Give a
 *  survivor a moment to land, then cut it loose: it ends as a timeout and the user can ask again. */
export function localResumed(awayMs, graceMs = 8000) {
  const mine = job
  if (!mine || awayMs < 15000) return   // a short look at another app does not kill a request
  setTimeout(() => { if (job === mine && ctl) ctl.abort() }, graceMs)
}

export function _resetLocal() { job = null; ctl = null; lastError = null; last = null; chatCtl = null }
