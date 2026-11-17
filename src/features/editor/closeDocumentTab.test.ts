import {describe,it,expect,vi} from 'vitest';
import {prepareDocumentTabClose} from './closeDocumentTab';

describe('closing a document tab',()=>{
  it('retains a dirty tab when saving fails',async()=>{
    const save=vi.fn(async()=>false);
    expect(await prepareDocumentTabClose({blocked:()=>false,composing:()=>false,pending:()=>false,dirty:()=>true,save,valid:()=>true})).toBe('unsaved');
    expect(save).toHaveBeenCalledOnce();
  });
  it('retains new edits made while saving',async()=>{
    let dirty=true;
    const result=await prepareDocumentTabClose({blocked:()=>false,composing:()=>false,pending:()=>false,dirty:()=>dirty,save:async()=>{dirty=false;await Promise.resolve();dirty=true;return true;},valid:()=>true});
    expect(result).toBe('unsaved');
  });
  it('checks pending work and session identity again after saving',async()=>{
    let pending=false,valid=true,dirty=true;
    const base={blocked:()=>false,composing:()=>false,pending:()=>pending,dirty:()=>dirty,save:async()=>{dirty=false;pending=true;return true;},valid:()=>valid};
    expect(await prepareDocumentTabClose(base)).toBe('changed');
    pending=false;dirty=true;base.save=async()=>{dirty=false;valid=false;return true;};
    expect(await prepareDocumentTabClose(base)).toBe('changed');
  });
  it('does not save or close while a proposal or operation needs attention',async()=>{
    const save=vi.fn(async()=>true),base={blocked:()=>false,composing:()=>false,pending:()=>true,dirty:()=>true,save,valid:()=>true};
    expect(await prepareDocumentTabClose(base)).toBe('pending');
    expect(await prepareDocumentTabClose({...base,blocked:()=>true})).toBe('blocked');
    expect(save).not.toHaveBeenCalled();
  });
  it('keeps the tab when composition is active or begins while saving',async()=>{
    let composing=true,dirty=true;
    const save=vi.fn(async()=>{dirty=false;composing=true;return true;});
    const options={blocked:()=>false,composing:()=>composing,pending:()=>false,dirty:()=>dirty,save,valid:()=>true};
    expect(await prepareDocumentTabClose(options)).toBe('composing');
    expect(save).not.toHaveBeenCalled();
    composing=false;
    expect(await prepareDocumentTabClose(options)).toBe('composing');
  });
  it('retains a tab rebound to another path or content generation while saving',async()=>{
    let path='first.md',version=1,dirty=true;
    const originalPath=path,originalVersion=version;
    const options={blocked:()=>false,composing:()=>false,pending:()=>false,dirty:()=>dirty,valid:()=>path===originalPath&&version===originalVersion,save:async()=>{dirty=false;path='second.md';return true;}};
    expect(await prepareDocumentTabClose(options)).toBe('changed');
    path=originalPath;dirty=true;options.save=async()=>{dirty=false;version++;return true;};
    expect(await prepareDocumentTabClose(options)).toBe('changed');
  });

});
