/* The Coach conversation, per profile: a bounded list in its own file next to the job record.
 *
 * Not in the synced state for the reason proposals are not (see jobs.js): a client PUTs its
 * whole state and the newest `_ts` wins, so a reply written there could be erased by the next
 * device to sync an older copy. The server owns this file; the client reads it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../durable.js';

const DATA = process.env.DATA_DIR || '/data';
const COACH_DIR = path.join(DATA, 'coach');
export const MAX_MESSAGES = 40;      // what is kept; older turns fall off the front
export const MAX_TEXT = 8000;        // per message, whatever the model or the client sent

const safe = uid => String(uid).replace(/[^a-zA-Z0-9_-]/g, '');
const fileFor = uid => path.join(COACH_DIR, 'chat-' + safe(uid) + '.json');

export function readChat(uid) {
  try {
    const list = JSON.parse(fs.readFileSync(fileFor(uid), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function appendChat(uid, msg) {
  fs.mkdirSync(COACH_DIR, { recursive: true, mode: 0o700 });
  const next = [...readChat(uid), { ...msg, text: String(msg.text).slice(0, MAX_TEXT) }].slice(-MAX_MESSAGES);
  atomicWrite(fileFor(uid), JSON.stringify(next), 0o600);
  return next;
}

/* A turn in flight, by profile: the controller that cancels it and an epoch that tells it,
   once it lands, whether the profile was forgotten meanwhile (then it writes nothing). */
const active = new Map();   // uid → AbortController
const epochs = new Map();   // uid → bumped by every clearChat
export const epochOf = uid => epochs.get(uid) || 0;
export const isActive = uid => active.has(uid);
export const setActive = (uid, ctl) => { if (ctl) active.set(uid, ctl); else active.delete(uid); };
export function cancelChat(uid) { const c = active.get(uid); if (c) c.abort(); return !!c; }

/** Consent withdrawn, profile deleted, or the user cleared the conversation. */
export function clearChat(uid) {
  epochs.set(uid, epochOf(uid) + 1);
  cancelChat(uid);
  try { fs.unlinkSync(fileFor(uid)); } catch { /* nothing to clear */ }
}
