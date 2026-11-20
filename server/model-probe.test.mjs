import {describe, expect, it, vi} from 'vitest';
import {sendChatCompletion} from './model-probe.mjs';

const conversation = '83f53471-245e-4c86-a501-e65272c30a38';
const payload = {model:'deepseek-v4.1-flash', stream:true, messages:[{role:'user', content:'Review the function.'}]};
const signal = new AbortController().signal;

describe('OpenCode Go chat requests', () => {
  it.each([
    'https://opencode.ai/zen/go/v1',
    'https://opencode.ai/inference/go/openai/v1/chat/completions',
  ])('uses the same conversation identifier on each turn to %s', async endpoint => {
    const request = vi.fn().mockImplementation(async () => Response.json({}));
    const route = {endpoint, sessionId:conversation};
    await sendChatCompletion(route, payload, signal, undefined, request);
    await sendChatCompletion(route, payload, signal, undefined, request);
    for (const [,options] of request.mock.calls) {
      expect(options.headers['x-opencode-session']).toBe(conversation);
      expect(options.headers['User-Agent']).toBe('HIVE-markdown-editor');
      expect(JSON.parse(options.body)).toEqual(payload);
    }
  });

  it.each([
    'https://api.example.test/zen/go/v1',
    'https://opencode.ai/inference/openai/v1',
  ])('keeps the provider-specific headers off %s', async endpoint => {
    const request = vi.fn().mockResolvedValue(Response.json({}));
    await sendChatCompletion({endpoint, sessionId:conversation}, payload, signal, undefined, request);
    const {headers} = request.mock.calls[0][1];
    expect(headers).not.toHaveProperty('x-opencode-session');
    expect(headers).not.toHaveProperty('User-Agent');
  });

  it('keeps a generated probe identifier when retrying the output limit parameter', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({error:{param:'max_completion_tokens', code:'unsupported_parameter'}}, {status:400}))
      .mockResolvedValueOnce(Response.json({}));
    await sendChatCompletion({endpoint:'https://opencode.ai/zen/go/v1'}, payload, signal, 32, request);
    const [,first] = request.mock.calls[0];
    const [,retry] = request.mock.calls[1];
    expect(first.headers['x-opencode-session']).toMatch(/^[\da-f-]{36}$/);
    expect(retry.headers['x-opencode-session']).toBe(first.headers['x-opencode-session']);
    expect(JSON.parse(retry.body).max_tokens).toBe(32);
  });
});
