export function reasoningOptions(value){
  if(value===undefined||value==='default')return {};
  if(!['low','medium','high','xhigh'].includes(value))throw Object.assign(new Error('推理强度无效，请重新选择。'),{status:400});
  return {reasoning_effort:value};
}
