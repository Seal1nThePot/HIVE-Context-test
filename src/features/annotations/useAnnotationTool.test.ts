import {describe,it,expect} from 'vitest';
import {isAnnotationSelectionKey} from './useAnnotationTool';
describe('annotation keyboard gesture',()=>{
  it('only begins with Shift and a navigation key outside composition',()=>{
    expect(isAnnotationSelectionKey({key:'ArrowRight',shiftKey:true,isComposing:false})).toBe(true);
    expect(isAnnotationSelectionKey({key:'Shift',shiftKey:true,isComposing:false})).toBe(false);
    expect(isAnnotationSelectionKey({key:'a',shiftKey:true,isComposing:false})).toBe(false);
    expect(isAnnotationSelectionKey({key:'ArrowRight',shiftKey:true,isComposing:true})).toBe(false);
    expect(isAnnotationSelectionKey({key:'ArrowRight',shiftKey:false,isComposing:false})).toBe(false);
  });
});
