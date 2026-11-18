import {effectiveInputTypes, effectiveReasoningLevels} from './model-capabilities.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const maxRequestCharacters = 120000;

export function reasoningOptions(value, model) {
  const level = value === undefined ? model?.defaultReasoning : value;
  if (level === undefined || level === 'default') return {};
  if (!effectiveReasoningLevels(model).includes(level)) fail('所选推理档位已不可用，请切回默认或重新选择。', 409);
  const {parameter, value: upstreamValue} = model.capabilities?.reasoning?.[level] ??
    {parameter: 'reasoning_effort', value: level === 'off' ? 'none' : level};
  switch (parameter) {
    case 'reasoning.effort': return {reasoning: {effort: upstreamValue}};
    case 'thinking.type': return {thinking: {type: upstreamValue}};
    default: return {reasoning_effort: upstreamValue};
  }
}

const textPartTypes = new Set(['text', 'input_text']);
const imagePartTypes = new Set(['image_url', 'input_image', 'image']);
const imageUrl = value => typeof value === 'string' ? value : value?.url;
function validPart(part) {
  if (!part || typeof part !== 'object') return false;
  if (textPartTypes.has(part.type)) return typeof part.text === 'string' && part.text.length <= 100000;
  if (imagePartTypes.has(part.type)) return /^data:image\//.test(imageUrl(part.image_url) ?? '');
  return false;
}
function validContent(message) {
  const {role, content} = message ?? {};
  if (typeof content === 'string') return true;
  return role === 'user' && Array.isArray(content) && content.length > 0 && content.length <= 32 && content.every(validPart);
}
export function generationPayload(route, body) {
  if (!Array.isArray(body.messages) || body.messages.length > 160 || body.messages.some(message =>
    !['system', 'user', 'assistant'].includes(message?.role) || !validContent(message)
  )) fail('本轮上下文格式无效或超过 160 条消息。');
  const hasImages = body.messages.some(message => Array.isArray(message.content) && message.content.some(part => imagePartTypes.has(part.type)));
  if (hasImages && !effectiveInputTypes(route.modelConfig).includes('image')) {
    fail('该模型未声明图片输入。请在「模型设置 · 输入类型」勾选图片，或换用支持图片的模型。', 415);
  }
  // Only role and text are used by this protocol. The full text of every supplied message stays intact.
  const messages = body.messages.map(({role, content}) => ({role, content}));
  const reasoning = reasoningOptions(body.reasoningEffort, route.modelConfig);
  const payload = {model: route.model, messages, stream: true, ...reasoning};
  const model = route.modelConfig;
  const contextTokens = model?.contextTokens ?? model?.capabilities?.contextTokens;
  const upstreamOutput = model?.capabilities?.maxOutputTokens;
  const estimatedInput = serialized => Buffer.byteLength(serialized, 'utf8') + 64 + 16 * messages.length;
  const serialize = output => JSON.stringify(output === undefined ? payload : {...payload, max_completion_tokens: output});
  const legacyOutput = contextTokens === undefined ? undefined : Math.max(1, Math.min(2048, Math.floor(contextTokens / 4)));
  let outputLimit = model?.maxOutputTokens ?? upstreamOutput ?? legacyOutput;
  if (model?.maxOutputTokens === undefined && upstreamOutput !== undefined && contextTokens !== undefined) {
    // Following the provider uses its output ceiling while keeping the current input within the context.
    const remaining = contextTokens - estimatedInput(serialize(upstreamOutput));
    outputLimit = Math.max(1, Math.min(upstreamOutput, remaining));
  }
  const serialized = serialize(outputLimit);
  if (serialized.length > maxRequestCharacters) {
    fail('本轮请求超过 HIVE 的 12 万序列化字符上限，请减少会话内容或缩小选区后重试。');
  }
  if (contextTokens !== undefined) {
    // Provider tokenizers differ. Budget UTF-8 request bytes as tokens, plus chat template allowance.
    const estimate = estimatedInput(serialized) + outputLimit;
    if (estimate > contextTokens) {
      fail(`本轮完整请求约需 ${estimate} token（含 ${outputLimit} 输出预留），超过该模型的 ${contextTokens} token 上限。请缩小选区、减少参考资料或另开会话。`, 413);
    }
  }
  return {payload, outputLimit};
}
