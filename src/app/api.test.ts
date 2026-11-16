import {describe,expect,it,vi} from 'vitest';
import {requestApi} from './api';
import {requestJson} from '../shared/api';

describe('application API migration',()=>{
  it('keeps the workspace-bound request function and serializes writes unchanged',async()=>{
    const request=vi.fn<typeof fetch>().mockResolvedValue(Response.json({hash:'next'}));expect(await requestJson(request,'/file',{path:'A.md',baseline:'old'})).toEqual({hash:'next'});
    expect(request).toHaveBeenCalledWith('/api/file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'A.md',baseline:'old'})});
  });
  it('normalizes legacy model configuration only for configuration routes',async()=>{
    const request=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json({endpoint:'http://localhost:4000/v1',model:'test',hasKey:false}));
    const config=await requestApi<{services:unknown[]}>(request,'/config');expect(config.services).toHaveLength(1);
    expect(await requestApi(request,'/file')).not.toHaveProperty('services');
  });
  it('retains backend error messages',async()=>{
    await expect(requestApi(vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:'文件已变化'},{status:409})),'/file')).rejects.toThrow('文件已变化');
  });
});
