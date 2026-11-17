import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {EditorState} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import {markdownDisplayExtensions,markdownPreview,setDisplayMode,setPreviewFocus} from './markdownDisplay';
import {previewPlan,visibleReplacements} from './markdownPresentation';
import {mathRenderer} from './mathRenderer';
import {MAX_MATH_SOURCE,mathSource,scanMath} from './mathSyntax';

const create=(doc:string)=>EditorState.create({doc,extensions:[markdownDisplayExtensions,history()]});
const formulas=(state:EditorState)=>previewPlan(state).replacements.filter(item=>item.kind==='math');

describe('dollar math recognition and live source boundaries',()=>{
  it('preserves TeX spaces while removing only display delimiter lines',()=>{
    expect(mathSource('$x\\ $',false)).toBe('x\\ ');
    expect(mathSource('  $$ \n    x\\ \n  $$  ',true)).toBe('    x\\ ');
    expect(mathSource('$$ x\\  $$',true)).toBe(' x\\  ');
  });
  it('recognizes inline, adjacent display blocks and one-line display without copying TeX into the plan',()=>{
    const doc='行内 $E=mc^2$。\n\n$$\nx_i * y_i\n$$\n$$\n\\frac{1}{2}\n$$\n\n$$a+b$$';
    const state=create(doc),items=formulas(state);
    expect(items.map(item=>!!item.block)).toEqual([false,true,true,true]);
    expect(items.every(item=>item.text===undefined&&item.src===undefined)).toBe(true);
    expect(state.doc.toString()).toBe(doc);
    const shown=visibleReplacements(state,false);
    for(let index=1;index<shown.length;index++)expect(shown[index].from).toBeGreaterThanOrEqual(shown[index-1].to);
  });
  it('excludes YAML, fenced/indented/inline code, escaped dollars, ordinary prices, HTML and table cells',()=>{
    const doc=['---','formula: "$yaml$"','---','','`$code$` and \\$escaped\\$','','```latex','$$x$$','$fence$','```','','    $indented$','','价格 $5 到 $10，US$50；$x$。','','<span title="$html$">标记</span>','','| A | B |','| --- | --- |','| $cell$ | normal |'].join('\n');
    const state=create(doc);expect(formulas(state).map(item=>state.sliceDoc(item.from,item.to))).toEqual(['$x$']);
  });
  it('gives a display block precedence over Markdown-looking contents',()=>{
    const state=create('## 正常标题\n\n$$\nx_i * y_i + ![a](example.png) + `x`\n$$');
    const item=formulas(state)[0];expect(item).toBeDefined();
    expect(previewPlan(state).replacements.filter(other=>other!==item&&other.from>=item.from&&other.to<=item.to)).toEqual([]);
    expect(previewPlan(state).styles.some(style=>style.className==='cm-preview-h2')).toBe(true);
    const indented=create('$$\n    x^2\n$$');expect(formulas(indented)).toHaveLength(1);
    expect(formulas(indented)[0].block).toBe(true);
  });
  it('leaves unclosed and malformed display content literally readable',()=>{
    const state=create('$$\n*x* and \\frac{1}{2}\n\nno closing');
    expect(formulas(state)).toHaveLength(0);expect(visibleReplacements(state,false)).toEqual([]);
    expect(scanMath('$missing\n$also missing').math).toEqual([]);
    expect(visibleReplacements(create('$$a * b\nnext'),false)).toEqual([]);
  });
  it('reveals the whole formula while its line is active and restores rendering without source edits',()=>{
    const doc='before\n\n$$\n\\frac{a}{b}\n$$\n\nafter $x$';let state=create(doc);
    const block=formulas(state).find(item=>item.block)!;
    state=state.update({effects:setPreviewFocus.of(true),selection:{anchor:block.from+4}}).state;
    expect(visibleReplacements(state,true).filter(item=>item.kind==='math')).toHaveLength(1);
    const selected=state.selection;state=state.update({effects:setDisplayMode.of('source')}).state;
    expect(state.field(markdownPreview).size).toBe(0);expect(state.selection).toEqual(selected);expect(state.doc.toString()).toBe(doc);
    state=state.update({effects:[setDisplayMode.of('live'),setPreviewFocus.of(false)]}).state;
    expect(visibleReplacements(state,false).filter(item=>item.kind==='math')).toHaveLength(2);
  });
  it('invalidates recognition after incremental edits and YAML boundary changes and preserves undo',()=>{
    let state=create('---\nformula: "$x$"\n---\n\n$y$');expect(formulas(state)).toHaveLength(1);
    state=state.update({changes:{from:0,to:4},userEvent:'input'}).state;expect(formulas(state)).toHaveLength(2);
    expect(undo({state,dispatch:tr=>{state=tr.state;}})).toBe(true);expect(formulas(state)).toHaveLength(1);
    const last=state.doc.length;state=state.update({changes:{from:last-1,to:last,insert:''}}).state;
    expect(formulas(state)).toHaveLength(0);expect(state.doc.toString().endsWith('$y')).toBe(true);
  });
  it('maps math positions through the existing single-cell table fast path',()=>{
    const doc='| A | B |\n| --- | --- |\n| x | y |\n\n$E=mc^2$';let state=create(doc);const old=formulas(state)[0];
    const cell=previewPlan(state).replacements.find(item=>item.kind==='table')!.rows![1][0];
    state=state.update({changes:{from:cell.from+1,to:cell.from+2,insert:'longer'}}).state;
    const next=formulas(state)[0];expect(next.from).toBe(old.from+5);expect(state.sliceDoc(next.from,next.to)).toBe('$E=mc^2$');
  });
  it('keeps over-budget formula source visible with a separate explicit notice',()=>{
    const source='x'.repeat(MAX_MATH_SOURCE+1),state=create('$$\n'+source+'\n$$'),item=formulas(state)[0];
    expect(item.text).toContain('4096');let replaced=false,notice=false;
    state.field(markdownPreview).between(item.from,item.to,(from,to,decoration)=>{if(to>from&&decoration.spec.widget)replaced=true;if(from===to&&decoration.spec.widget)notice=true;});
    expect(replaced).toBe(false);expect(notice).toBe(true);expect(state.doc.toString()).toContain(source);
  });
  it('recognizes the acceptance fixtures and performs no rendering during 31,908-formula state creation',()=>{
    const request=vi.spyOn(mathRenderer,'request');
    try{
      const basic=create(readFileSync(resolve('performance/math-fixtures/01-公式功能验收.md'),'utf8'));
      expect(formulas(basic)).toHaveLength(5);
      const dense=create(readFileSync(resolve('performance/math-fixtures/02-密集独立公式.md'),'utf8'));
      expect(formulas(dense)).toHaveLength(31908);expect(formulas(dense).filter(item=>item.block)).toHaveLength(15954);
      expect(formulas(dense).every(item=>item.text===undefined&&item.src===undefined)).toBe(true);
      expect(request).not.toHaveBeenCalled();
    }finally{request.mockRestore();}
  });
});
