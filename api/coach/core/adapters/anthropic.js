/* Anthropic Messages API. */
import { httpAdapter } from './http.js';
import { SYSTEM_PROMPT } from '../system-prompt.js';

export const ANTHROPIC_VERSION = '2023-06-01';

export const anthropicSpec = {
  id: 'anthropic',
  path: () => '/v1/messages',
  modelsPath: '/v1/models',
  headers: key => ({
    'x-api-key': key,
    'anthropic-version': ANTHROPIC_VERSION,
    // Required for a call made from a browser context. Harmless from a server, and the phone's
    // native HTTP path does not need it either — it is here so a plain-browser dev run works.
    'anthropic-dangerous-direct-browser-access': 'true'
  }),
  // The rules block is marked cacheable: identical for every job of a task, so subsequent
  // jobs read it from Anthropic's prompt cache at a tenth of the input price.
  // A chat turn carries its own system prompt (free text, not the JSON-only one) and the whole
  // message history; `stream` asks for server-sent events.
  body: ({ model, prompt, system, maxTokens, messages, chat, stream }) => ({
    model,
    max_tokens: maxTokens,
    system: system
      ? [{ type: 'text', text: chat ? system : SYSTEM_PROMPT + '\n\n' + system, cache_control: { type: 'ephemeral' } }]
      : SYSTEM_PROMPT,
    messages: messages || [{ role: 'user', content: prompt }],
    ...(stream ? { stream: true } : {})
  }),
  readDelta: evt => {
    if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') return { text: evt.delta.text };
    if (evt.type === 'message_delta' && evt.delta && evt.delta.stop_reason === 'max_tokens') return { truncated: true };
    if (evt.type === 'message_delta' && evt.delta && evt.delta.stop_reason === 'refusal') return { error: 'the model declined this request' };
    if (evt.type === 'error') return { error: (evt.error && evt.error.message) || 'the provider stopped the stream' };
    return {};
  },
  errorMessage: data => data && data.error && data.error.message,
  readText: data => {
    if (data.stop_reason === 'refusal') return { error: 'the model declined this request' + (data.stop_details && data.stop_details.explanation ? ': ' + data.stop_details.explanation : '') };
    const text = (data.content || []).filter(b => b && b.type === 'text').map(b => b.text).join('');
    return { text, truncated: data.stop_reason === 'max_tokens' };
  },
  readModels: data => (data.data || []).map(m => m.id)
};

export default httpAdapter(anthropicSpec);
