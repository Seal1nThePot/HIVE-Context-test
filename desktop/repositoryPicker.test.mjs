import {describe,it,expect,vi} from 'vitest';
import path from 'node:path';
import {createRepositoryPicker} from './repositoryPicker.cjs';
const selected=path.resolve('test-repository');
function fixture(show=async()=>({canceled:false,filePaths:[selected]})){
  const parent={isDestroyed:()=>false},showOpenDialog=vi.fn(show),isMainOrigin=vi.fn(()=>true),getParent=vi.fn(()=>parent);
  return {parent,showOpenDialog,isMainOrigin,getParent,pick:createRepositoryPicker({isMainOrigin,getParent,showOpenDialog})};
}
describe('repository directory picker',()=>{
  it('opens a single-directory system chooser attached to the application window',async()=>{
    const t=fixture();expect(await t.pick({})).toBe(selected);
    expect(t.showOpenDialog).toHaveBeenCalledWith(t.parent,{title:'选择仓库文件夹',buttonLabel:'添加仓库',properties:['openDirectory']});
  });
  it.each([{canceled:true,filePaths:[selected]},{canceled:false,filePaths:[]},{canceled:false,filePaths:['relative']},{canceled:false,filePaths:[selected+'\0bad']}])('returns no selection for cancellation or an invalid response %j',async result=>{
    expect(await fixture(async()=>result).pick({})).toBeNull();
  });
  it('does not open a chooser for an untrusted sender or a closed owner',async()=>{
    const t=fixture();t.isMainOrigin.mockReturnValue(false);await expect(t.pick({})).rejects.toThrow('此窗口');expect(t.showOpenDialog).not.toHaveBeenCalled();
    t.isMainOrigin.mockReturnValue(true);t.parent.isDestroyed=()=>true;expect(await t.pick({})).toBeNull();expect(t.showOpenDialog).not.toHaveBeenCalled();
  });
  it('shares the pending dialog across repeated clicks and clears it after an error',async()=>{
    let resolve;const t=fixture(()=>new Promise(done=>{resolve=done;}));
    const first=t.pick({}),second=t.pick({});expect(t.showOpenDialog).toHaveBeenCalledTimes(1);
    resolve({canceled:false,filePaths:[selected]});expect(await Promise.all([first,second])).toEqual([selected,selected]);
    t.showOpenDialog.mockRejectedValueOnce(new Error('chooser failed'));await expect(t.pick({})).rejects.toThrow('chooser failed');
    t.showOpenDialog.mockResolvedValueOnce({canceled:true,filePaths:[]});expect(await t.pick({})).toBeNull();
  });
});
