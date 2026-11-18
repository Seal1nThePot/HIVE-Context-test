export const reasoningLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export const inputTypes = ['text', 'image'];
export const configurationLimit = 100;
const parameters = new Set(['reasoning_effort', 'reasoning.effort', 'thinking.type']);

export function tokenCapacity(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function reasoningMapping(source) {
  if (!source || typeof source !== 'object') return undefined;
  const result = {};
  for (const level of reasoningLevels) {
    const mapping = source[level];
    if (parameters.has(mapping?.parameter) && typeof mapping.value === 'string' && /^[\w-]{1,48}$/.test(mapping.value)) {
      result[level] = {parameter: mapping.parameter, value: mapping.value};
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function inputMapping(source) {
  if (!Array.isArray(source)) return undefined;
  const declared = [...new Set(source.filter(type => typeof type === 'string' && inputTypes.includes(type)))];
  return declared.length ? inputTypes.filter(type => declared.includes(type)) : undefined;
}

export function cleanCapabilities(source) {
  const reasoning = reasoningMapping(source?.reasoning);
  const contextTokens = tokenCapacity(source?.contextTokens);
  const maxOutputTokens = tokenCapacity(source?.maxOutputTokens);
  const input = inputMapping(source?.input);
  return reasoning || contextTokens || maxOutputTokens || input
    ? {...(reasoning && {reasoning}), ...(contextTokens && {contextTokens}), ...(maxOutputTokens && {maxOutputTokens}), ...(input && {input})}
    : undefined;
}

export function catalogCapabilities(model) {
  const declared = model.capabilities;
  let reasoning = reasoningMapping(declared?.reasoning ?? model.reasoning?.levels);
  // A supported-parameters list alone says nothing about which efforts are accepted.
  const efforts = model.reasoning_efforts ?? model.supported_reasoning_efforts;
  if (!reasoning && Array.isArray(efforts)) {
    const parameter = model.reasoning_effort_parameter ?? 'reasoning_effort';
    const mappings = {};
    for (const value of efforts) {
      const level = value === 'none' ? 'off' : value;
      if (reasoningLevels.includes(level)) mappings[level] = {parameter, value};
    }
    reasoning = reasoningMapping(mappings);
  }
  const contextTokens = [declared?.contextTokens, model.context_length, model.context_window, model.max_model_len, model.top_provider?.context_length]
    .map(tokenCapacity).find(Boolean);
  const maxOutputTokens = [declared?.maxOutputTokens, model.max_output_tokens, model.max_completion_tokens, model.top_provider?.max_completion_tokens]
    .map(tokenCapacity).find(Boolean);
  const input = inputMapping(declared?.input) ?? inputMapping(model.architecture?.input_modalities) ?? inputMapping(model.input_modalities);
  return cleanCapabilities({reasoning, contextTokens, maxOutputTokens, input});
}

export function effectiveInputTypes(model) {
  const declared = model?.inputTypes ?? model?.capabilities?.input;
  const types = inputTypes.filter(type => declared?.includes(type));
  return types.length ? types : ['text'];
}

export function effectiveReasoningLevels(model) {
  return reasoningLevels.filter(level =>
    model?.manualReasoningLevels?.includes(level) ||
    (model?.capabilities?.reasoning?.[level] &&
      (model.reasoningLevels === undefined || model.reasoningLevels.includes(level))));
}
