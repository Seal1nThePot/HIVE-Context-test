import {randomUUID} from 'node:crypto';
import {catalogCapabilities, configurationLimit} from './model-capabilities.mjs';
import {modelEndpoints} from './model-config.mjs';

const catalogBytes = 8 * 1024 * 1024;
const completionBytes = 64 * 1024;
const testMessage = 'Reply with OK.';
const fail = (message, status = 502) => { throw Object.assign(new Error(message), {status}); };

export async function upstreamJson(response, limit) {
  if (!response.body) fail('模型端点没有返回可读取的响应。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let json = '';
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) fail('模型端点返回的内容超出读取上限。');
      json += decoder.decode(value, {stream: true});
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  try { return JSON.parse(json + decoder.decode()); }
  catch { fail('模型端点未返回有效的 JSON。'); }
}

export function upstreamHttpError(status, catalog) {
  if (status === 401 || status === 403) return `模型端点未通过鉴权（HTTP ${status}），请检查密钥和访问权限。`;
  if (status >= 300 && status < 400) return '模型端点要求跳转。请直接填写最终的兼容接口地址。';
  if (status === 404 && catalog) return '此地址未提供模型列表（HTTP 404），请核对接口地址或手动填写模型 ID。';
  if (status === 429) return '模型端点已限流或额度不足（HTTP 429），请稍后重试或检查额度。';
  return `模型端点返回 HTTP ${status}，请检查接口地址、模型或服务配置。`;
}

function upstreamHeaders(key) {
  return {Accept: 'application/json', ...(key ? {Authorization: `Bearer ${key}`} : {})};
}

function catalogModels(data, key) {
  if (data?.error || !Array.isArray(data?.data)) fail('模型端点未返回兼容的模型列表（需要 data 数组）。');
  const models = new Map();
  for (const item of data.data) {
    if (typeof item?.id !== 'string') continue;
    const id = item.id.trim();
    if (!id || id.length > 200 || /[\r\n\0]/.test(id)) continue;
    const label = typeof item.name === 'string' ? item.name.trim() : '';
    const name = label && label.length <= 200 && !/[\r\n\0]/.test(label) ? label : id;
    const capabilities = catalogCapabilities(item);
    const original = models.get(id);
    if (!original) models.set(id, {id, name, ...(capabilities && {capabilities})});
    else if (capabilities) {
      original.capabilities = {...capabilities, ...original.capabilities};
    }
  }
  const entries = [...models.values()];
  // Do not surface a provider response that echoes the submitted credential.
  if (key && entries.some(entry => [entry.id, entry.name, ...Object.values(entry.capabilities?.reasoning ?? {}).map(mapping => mapping.value)]
    .some(value => value === key || key.length >= 8 && value.includes(key)))) {
    fail('模型列表包含不应返回的连接信息，已停止读取。');
  }
  return entries;
}

function unsupportedCompletionLimit(error) {
  const detail = error?.error;
  if (detail?.param === 'max_completion_tokens') {
    if (['unsupported_parameter', 'unknown_parameter', 'unrecognized_request_argument'].includes(detail.code)) return true;
  }
  const message = typeof detail?.message === 'string' ? detail.message : '';
  return /max_completion_tokens/i.test(message) && /unsupported|not supported|unknown|unrecognized|extra inputs/i.test(message);
}

export async function sendChatCompletion(route, payload, signal, outputLimit, request = fetch) {
  const endpoint = new URL(modelEndpoints(route.endpoint).chat);
  const headers = {
    ...upstreamHeaders(route.key), 'Content-Type': 'application/json',
    Accept: payload.stream ? 'text/event-stream, application/json' : 'application/json',
  };
  if (endpoint.origin === 'https://opencode.ai' &&
      /^\/(?:zen\/go\/v1|inference\/go\/openai\/v1)\/chat\/completions$/.test(endpoint.pathname)) {
    // Go uses this as a routing/cache key, so use a conversation UUID rather
    // than a repository, file, or account identifier.
    const suppliedId = route.sessionId;
    headers['User-Agent'] = 'HIVE-markdown-editor';
    headers['x-opencode-session'] = typeof suppliedId === 'string' &&
      /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(suppliedId) ? suppliedId : randomUUID();
  }
  const send = parameters => request(endpoint.href, {
    method: 'POST',
    headers,
    body: JSON.stringify({...payload, ...parameters}),
    redirect: 'manual',
    signal,
  });
  const response = await send(outputLimit ? {max_completion_tokens: outputLimit} : {});
  if (outputLimit && (response.status === 400 || response.status === 422)) {
    const error = await upstreamJson(response, completionBytes).catch(() => null);
    signal.throwIfAborted();
    if (unsupportedCompletionLimit(error)) return send({max_tokens: outputLimit});
  }
  return response;
}

export async function probeModelService(route, {signal, timeoutMs = 10000, request = fetch} = {}) {
  const started = performance.now();
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    if (!route.model) {
      const response = await request(modelEndpoints(route.endpoint).models, {
        method: 'GET', headers: upstreamHeaders(route.key), redirect: 'manual', signal: combined,
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        fail(upstreamHttpError(response.status, true));
      }
      const data = await upstreamJson(response, catalogBytes);
      return {
        kind: 'catalog',
        models: catalogModels(data, route.key),
        configurationLimit,
        ...(data.has_more === true && {hasMore: true}),
      };
    }
    const payload = {model: route.model, messages: [{role: 'user', content: testMessage}], stream: false};
    const response = await sendChatCompletion(route, payload, combined, 32, request);
    if (!response.ok) {
      if (!response.bodyUsed) void response.body?.cancel().catch(() => {});
      fail(upstreamHttpError(response.status, false));
    }
    const data = await upstreamJson(response, completionBytes);
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    const producedTokens = choice?.finish_reason === 'length' && data?.usage?.completion_tokens > 0;
    if (data?.error || !producedTokens && (typeof content !== 'string' || !content.trim())) {
      fail('模型端点未返回可用的测试回复。请检查所选模型是否支持 Chat Completions。');
    }
    return {kind: 'generation', modelId: route.model, elapsedMs: Math.round(performance.now() - started)};
  } catch (error) {
    if (timeout.aborted) fail('模型服务测试超时，请检查网络后重试。', 504);
    if (signal?.aborted) throw error;
    if (error.status) throw error;
    fail('无法连接模型端点，请检查网络及接口地址。');
  }
}
