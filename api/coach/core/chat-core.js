/* What a chat turn sends, shared by the server (api/coach/chat.js) and the phone's own-key
 * Coach (frontend/src/lib/coach-local.js), so both put the same words and the same data in front
 * of the model. Pure: no file, clock or environment. */
import { CHAT_SYSTEM_PROMPT } from './system-prompt.js';
import { MAX_PAYLOAD_CHARS } from './payload.js';

export const TURNS_SENT = 12;           // messages of history the provider sees
export const CHAT_MAX_TOKENS = 2000;    // a reply, not a plan

/** The provider's view of the conversation: starts on a user turn, roles named the way APIs name them. */
export function toProviderMessages(history) {
  const msgs = history.slice(-TURNS_SENT).map(m => ({ role: m.role === 'coach' ? 'assistant' : 'user', content: m.text }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs;
}

/** The system message: the chat rules, then the payload the jobs use (minus the exercise
 *  catalogue, which is for plans). Returns null when the data is too large to send. */
export function chatSystem(payload) {
  const { library: _library, ...slim } = payload;
  const data = JSON.stringify(slim);
  return data.length > MAX_PAYLOAD_CHARS ? null : CHAT_SYSTEM_PROMPT + '\n\nThe lifter\'s data (JSON):\n' + data;
}
