/* OpenRouter: the Chat Completions shape at a fixed endpoint, plus the account's credit balance.
 *
 * Balance: /v1/credits is the account total but answers only a management key (403 otherwise),
 * so a normal key falls back to /v1/key, which reports that key's own limit and usage. */
import { httpAdapter } from './http.js';
import { chatCompletionsSpec } from './openai.js';

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const openrouterSpec = {
  ...chatCompletionsSpec('openrouter', { maxTokensField: 'max_tokens' }),
  balancePaths: ['/v1/credits', '/v1/key'],
  readBalance: data => {
    const d = data && data.data;
    if (!d) return null;
    if (num(d.total_credits) != null) {
      const used = num(d.total_usage) || 0;
      return { scope: 'account', remaining: d.total_credits - used, used, limit: d.total_credits };
    }
    if (num(d.usage) != null) return { scope: 'key', remaining: num(d.limit_remaining), used: d.usage, limit: num(d.limit) };
    return null;
  }
};
export default httpAdapter(openrouterSpec);
