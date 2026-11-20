import {z} from 'zod';
import {sendChatCompletion,upstreamHttpError,upstreamJson} from '../model-probe.mjs';

export const toolError=(message,status=400)=>Object.assign(new Error(message),{status});
export const toolInstruction=z.string().trim().min(1).max(8000);
export const toolSelection=z.strictObject({serviceId:z.string().min(1),modelId:z.string().min(1)}).optional();
export const workspaceId=z.string().regex(/^[a-f0-9]{24}$/);

export function modelTool(name,description,schema){
  const parameters=z.toJSONSchema(schema,{target:'draft-7'});
  delete parameters.$schema;
  return {name,schema,definition:{type:'function',function:{name,description,parameters}}};
}

export async function chooseTool(route,instruction,tools,signal,context=''){
  const offered=tools.map(tool=>tool.definition);
  const payload={model:route.model,stream:false,messages:[
    {role:'system',content:'你负责将用户指令转换为一次 HIVE 工具调用。只从给出的工具选择，并原样提取用户指定的查找内容、名称和路径。'+context},
    {role:'user',content:instruction},
  ],tools:offered,tool_choice:tools.length===1?{type:'function',function:{name:tools[0].name}}:'required'};
  const timeout=AbortSignal.timeout(45000),combined=AbortSignal.any([signal,timeout]);
  try{
    const upstream=await sendChatCompletion(route,payload,combined);
    if(!upstream.ok){
      void upstream.body?.cancel().catch(()=>{});
      const message=[400,422,501].includes(upstream.status)
        ? '所选模型服务拒绝了结构化工具请求，请换用支持工具调用的模型。'
        : upstreamHttpError(upstream.status,false);
      throw toolError(message,502);
    }
    const result=await upstreamJson(upstream,128*1024);
    const choice=result?.choices?.[0],calls=choice?.message?.tool_calls;
    if(result?.error||choice?.finish_reason==='length'||!Array.isArray(calls)||calls.length!==1){
      throw toolError('模型未完成一次结构化工具调用，请重试或换用支持工具调用的模型。',502);
    }
    const call=calls[0],tool=tools.find(item=>item.name===call?.function?.name);
    if(call?.type!=='function'||!tool||typeof call.function.arguments!=='string')throw toolError('模型返回了当前标注窗口不支持的操作。',502);
    let value;
    try{value=JSON.parse(call.function.arguments);}
    catch{throw toolError('模型返回了无效的工具参数，请重试。',502);}
    const parsed=tool.schema.safeParse(value);
    if(!parsed.success)throw toolError('模型返回了无效的工具参数，请重试。',502);
    return {name:tool.name,args:parsed.data};
  }catch(error){
    if(timeout.aborted)throw toolError('模型工具请求超时，请稍后重试。',504);
    if(signal.aborted||error.status)throw error;
    throw toolError('无法连接模型端点，请检查网络及接口地址。',502);
  }
}
