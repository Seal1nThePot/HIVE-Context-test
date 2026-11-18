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
  it.each([
    ['provider error','event: error\ndata: "额度不足"\n\n','额度不足'],
    ['invalid JSON','event: chunk\ndata: invalid\n\n',undefined],
    ['consumer error','event: chunk\ndata: "正文"\n\n','consumer failed'],
  ])('cancels an open response and releases its reader after %s',async(label,text,message)=>{
    const cancel=vi.fn(),body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode(text!));},cancel});
    const pending=streamModelText(vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),options(),()=>{if(label==='consumer error')throw new Error('consumer failed');});
    if(message)await expect(pending).rejects.toThrow(message);else await expect(pending).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();expect(body.locked).toBe(false);
  });
  it('cancels a pending read on abort and detaches its abort listener',async()=>{
    const controller=new AbortController(),cancel=vi.fn(),body=new ReadableStream<Uint8Array>({cancel}),remove=vi.spyOn(controller.signal,'removeEventListener');
    const pending=streamModelText(vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),{...options(),signal:controller.signal},()=>{});
    const checked=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await Promise.resolve();controller.abort();await checked;
    expect(cancel).toHaveBeenCalledOnce();expect(body.locked).toBe(false);expect(remove).toHaveBeenCalledWith('abort',expect.any(Function));
  });
  it('releases a completed reader without cancelling a successful response',async()=>{
    const response=sse('event: chunk\ndata: "正文"\n\nevent: done\ndata: null\n\n');
    expect(await streamModelText(vi.fn<typeof fetch>().mockResolvedValue(response),options(),()=>{})).toBe('正文');
    expect(response.body!.locked).toBe(false);
  });
  it('surfaces an HTTP error before reading any stream',async()=>{
    await expect(streamModelText(vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:'连接失败'},{status:502})),options(),()=>{})).rejects.toThrow('连接失败');
  });
  it('keeps demo edits scoped to the given selected text',async()=>{
    vi.useFakeTimers();const pending=generateDemoText({requestMode:'edit',requestLimit:100,node:'选区',target:'很清楚。',userPrompt:'把“很清楚”改成“足够清楚”',signal:new AbortController().signal});
    await vi.advanceTimersByTimeAsync(750);expect((await pending).trim()).toBe('[1]\n足够清楚。');
  });
  it('cancels a pending demo response through the original abort signal',async()=>{
    vi.useFakeTimers();const controller=new AbortController(),pending=generateDemoText({requestMode:'continue',requestLimit:100,node:'位置',target:'',userPrompt:'继续',signal:controller.signal});
    const checked=expect(pending).rejects.toMatchObject({name:'AbortError'});controller.abort();await checked;expect(vi.getTimerCount()).toBe(0);
  });
  it('removes the demo abort listener after completion and rejects an already stopped request',async()=>{
    vi.useFakeTimers();const controller=new AbortController(),add=vi.spyOn(controller.signal,'addEventListener'),remove=vi.spyOn(controller.signal,'removeEventListener');
    const input={requestMode:'discuss' as const,requestLimit:100,node:'位置',target:'',userPrompt:'讨论',signal:controller.signal};
    const pending=generateDemoText(input);await vi.advanceTimersByTimeAsync(750);await pending;
    expect(remove).toHaveBeenCalledWith('abort',add.mock.calls[0][1]);expect(vi.getTimerCount()).toBe(0);
    controller.abort();await expect(generateDemoText(input)).rejects.toMatchObject({name:'AbortError'});expect(vi.getTimerCount()).toBe(0);
  });
});
