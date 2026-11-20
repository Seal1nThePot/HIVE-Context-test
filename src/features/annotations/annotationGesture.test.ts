import {describe,expect,it} from 'vitest';
import {textAnnotationHit} from './annotationGesture';
import {windowAnnotationTarget} from './windowAnnotations';

describe('Ctrl-click annotations',()=>{
  const click={button:0,ctrlKey:true,metaKey:false,shiftKey:false,altKey:false};
  const ranges=[{from:6,to:12}];

  it('marks selected text or opens an existing annotation without intercepting links',()=>{
    expect(textAnnotationHit(click,7,ranges,undefined,undefined)).toBe(true);
    expect(textAnnotationHit(click,2,ranges,undefined,'existing-id')).toBe(true);
    expect(textAnnotationHit(click,7,ranges,'文档.md',undefined)).toBe(false);
    expect(textAnnotationHit(click,5,ranges,undefined,undefined)).toBe(false);
    expect(textAnnotationHit({...click,ctrlKey:false},7,ranges,undefined,undefined)).toBe(false);
    expect(textAnnotationHit({...click,shiftKey:true},7,ranges,undefined,undefined)).toBe(false);
  });

  it('distinguishes panel titles and tabs from pane content and header controls',()=>{
    const header={dataset:{lockPanel:'outline'}};
    const node=(matches:Record<string,unknown>)=>({closest:(selector:string)=>matches[selector]||null}) as Element;
    expect(windowAnnotationTarget(node({'.panel-drag-header':header}))).toBe('outline');
    expect(windowAnnotationTarget(node({'[data-panel-tab]':{dataset:{panelTab:'toc'}},'.panel-drag-header':header}))).toBe('toc');
    expect(windowAnnotationTarget(node({'button,a,input,textarea,select,[role="button"],[contenteditable],[data-no-drag]':{},'.panel-drag-header':header}))).toBeUndefined();
    expect(windowAnnotationTarget(node({'[data-panel-id]':{dataset:{panelId:'files'}}}))).toBeUndefined();
  });
});
