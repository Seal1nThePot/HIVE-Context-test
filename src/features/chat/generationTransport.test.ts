import {afterEach,describe,expect,it,vi} from 'vitest';
import {generateDemoText,streamModelText,type ModelGeneration} from './generationTransport';

function sse(text:string,splitEvery=1){
  const bytes=new TextEncoder().encode(text);
  return new Response(new ReadableStream<Uint8Array>({start(controller){
    for(let i=0;i<bytes.length;i+=splitEvery)controller.enqueue(bytes.slice(i,i+splitEvery));
    controller.close();
  }}));
}
const options=():ModelGeneration=>({messages:[{role:'user',content:'本轮要求'}],selection:{serviceId:'test',modelId:'model-a'},reasoningEffort:'high',signal:new AbortController().signal});
afterEach(()=>vi.useRealTimers());
describe('generation transport',()=>{
  it('preserves UTF-8 and SSE boundaries split across bytes and forwards the request snapshot',async()=>{
    const request=vi.fn<typeof fetch>().mockResolvedValue(sse('event: chunk\ndata: "你好"\n\nevent: chunk\ndata: "，世界"\n\nevent: done\ndata: null\n\n'));
    const snapshot=options(),updates:string[]=[];
    expect(await streamModelText(request,snapshot,text=>updates.push(text))).toBe('你好，世界');
    expect(updates).toEqual(['你好','你好，世界']);
    const [url,init]=request.mock.calls[0];expect(url).toBe('/api/generate');
    expect(JSON.parse(String(init!.body))).toEqual({messages:snapshot.messages,selection:snapshot.selection,reasoningEffort:'high'});expect(init!.signal).toBe(snapshot.signal);
  });
  it('rejects an interrupted response even if it contains partial text',async()=>{
    await expect(streamModelText(vi.fn<typeof fetch>().mockResolvedValue(sse('event: chunk\ndata: "partial"\n\n')),options(),()=>{})).rejects.toThrow('响应中断');
  });
  it('surfaces a streamed provider error',async()=>{
    await expect(streamModelText(vi.fn<typeof fetch>().mockResolvedValue(sse('event: error\ndata: "额度不足"\n\n')),options(),()=>{})).rejects.toThrow('额度不足');
  });
  it('surfaces an HTTP error before reading any stream',async()=>{
    await expect(streamModelText(vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:'连接失败'},{status:502})),options(),()=>{})).rejects.toThrow('连接失败');
  });
  it('keeps demo edits scoped to the given selected text',async()=>{
    vi.useFakeTimers();const pending=generateDemoText({requestMode:'edit',requestLimit:100,node:'选区',target:'很清楚。',userPrompt:'把“很清楚”改成“足够清楚”',signal:new AbortController().signal});
    await vi.advanceTimersByTimeAsync(750);expect(JSON.parse(await pending).text).toBe('足够清楚。');
  });
  it('cancels a pending demo response through the original abort signal',async()=>{
    vi.useFakeTimers();const controller=new AbortController(),pending=generateDemoText({requestMode:'continue',requestLimit:100,node:'位置',target:'',userPrompt:'继续',signal:controller.signal});
    const checked=expect(pending).rejects.toMatchObject({name:'AbortError'});controller.abort();await checked;expect(vi.getTimerCount()).toBe(0);
  });
});
