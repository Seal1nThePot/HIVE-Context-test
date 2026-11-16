import {describe,it,expect} from 'vitest';
import {EditorState} from '@codemirror/state';
import {isTypewriterInput,setTypewriter,typewriterEnabled,typewriterExtensions} from './typewriter';

function state(enabled=true){let value=EditorState.create({doc:'开始写作',extensions:typewriterExtensions});if(enabled)value=value.update({effects:setTypewriter.of(true)}).state;return value;}
describe('typewriter scroll policy',()=>{
  it('is disabled by default and toggles without changing text or the selection',()=>{
    const value=state(false),tr=value.update({effects:setTypewriter.of(true)});
    expect(value.field(typewriterEnabled)).toBe(false);expect(tr.state.field(typewriterEnabled)).toBe(true);expect(tr.docChanged).toBe(false);expect(tr.newSelection).toEqual(value.selection);
  });
  it('centers typed text, Chinese composition, Enter and keyboard deletion',()=>{
    for(const userEvent of ['input.type','input.type.compose','input','delete.backward','delete.forward','delete.selection','delete.line']){
      const tr=state().update({changes:{from:0,insert:'文字'},userEvent});
      expect(isTypewriterInput(tr),userEvent).toBe(true);expect(tr.effects.length,userEvent).toBe(1);
    }
  });
  it('does not center typing while the mode is off',()=>{
    expect(state(false).update({changes:{from:0,insert:'新'},userEvent:'input.type'}).effects).toHaveLength(0);
  });
  it('centers immediately on enable and follows empty keyboard cursor moves while preserving manual browsing',()=>{
    const value=state(false),enabled=value.update({effects:setTypewriter.of(true)});
    expect(enabled.effects).toHaveLength(2);
    expect(enabled.state.update({selection:{anchor:2},userEvent:'select'}).effects).toHaveLength(1);
    expect(enabled.state.update({selection:{anchor:2},userEvent:'select.pointer'}).effects).toHaveLength(0);
    expect(enabled.state.update({selection:{anchor:0,head:2},userEvent:'select'}).effects).toHaveLength(0);
  });
  it('does not recenter mouse clicks, scrolling, navigation, paste, formatting, AI or disk updates',()=>{
    for(const userEvent of ['select.pointer','select','input.paste','input.drop','delete.cut','input.format','input.shared-document','input.disk-sync','undo','redo']){
      const tr=state().update({changes:{from:0,insert:'新'},userEvent});expect(isTypewriterInput(tr),userEvent).toBe(false);expect(tr.effects,userEvent).toHaveLength(0);
    }
    expect(state().update({selection:{anchor:2},userEvent:'select.pointer'}).effects).toHaveLength(0);
  });
});
