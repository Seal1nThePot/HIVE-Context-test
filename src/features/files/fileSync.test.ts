import {describe,it,expect} from 'vitest';
import {diskSyncDecision} from './fileSync';
const baseline={text:'旧正文',hash:'old'};
describe('external disk synchronization',()=>{
  it('keeps unsaved edits while the disk baseline is unchanged',()=>{
    expect(diskSyncDecision([{baseline,text:'本地手改'}],baseline)).toBe('unchanged');
  });
  it('adopts an external update in a clean editor',()=>{
    expect(diskSyncDecision([{baseline,text:'旧正文'}],{text:'外部修改',hash:'new'})).toBe('adopt');
  });
  it('blocks adoption when local and external content diverge',()=>{
    expect(diskSyncDecision([{baseline,text:'本地手改'}],{text:'外部修改',hash:'new'})).toBe('conflict');
  });
  it('accepts the new disk baseline when both sides have identical content',()=>{
    expect(diskSyncDecision([{baseline,text:'相同修改'}],{text:'相同修改',hash:'new'})).toBe('adopt');
  });
  it('preserves a divergent same-file editor even if another editor is clean',()=>{
    expect(diskSyncDecision([{baseline,text:'旧正文'},{baseline,text:'另一区的手改'}],{text:'外部修改',hash:'new'})).toBe('conflict');
  });
  it('updates formatting metadata when content is unchanged but raw hash differs',()=>{
    expect(diskSyncDecision([{baseline,text:'旧正文'}],{text:'旧正文',hash:'new-eol-or-bom'})).toBe('adopt');
  });
});
