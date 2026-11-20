import {describe,expect,it} from 'vitest';
import {matchesShortcut,readShortcutBindings,shortcutChord,shortcutIssue,shortcutLabel} from './shortcuts';

const key=(value:string,modifiers:Partial<KeyboardEvent>={})=>({key:value,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...modifiers});
const stored=(bindings:Record<string,string>)=>JSON.stringify({version:1,bindings});

describe('shortcut customization',()=>{
  it('uses the new key and removes both previous chords for an action',()=>{
    const bindings=readShortcutBindings(stored({findNext:'Ctrl+Alt+P'}));
    expect(matchesShortcut(bindings,'findNext',key('F3'))).toBe(false);
    expect(matchesShortcut(bindings,'findNext',key('g',{ctrlKey:true}))).toBe(false);
    expect(matchesShortcut(bindings,'findNext',key('p',{ctrlKey:true,altKey:true}))).toBe(true);
    expect(shortcutLabel(bindings,'findNext')).toBe('Ctrl + Alt + P');
  });

  it('rejects overlapping bindings and permits the same shortcut in separate local scopes',()=>{
    expect(shortcutIssue({},'save','Ctrl+Enter')).toContain('新标签页');
    expect(shortcutIssue({},'bold','F3')).toContain('下一处');
    expect(shortcutIssue({},'sendMessage','Ctrl+Enter')).toBeUndefined();
    expect(readShortcutBindings(stored({save:'Ctrl+R',find:'A',callAI:'Ctrl+K'}))).toEqual({callAI:'Ctrl+K'});
  });

  it('requires exact modifiers and ignores IME composition',()=>{
    expect(matchesShortcut({},'openFiles',key('O',{metaKey:true}))).toBe(true);
    expect(matchesShortcut({},'openFiles',key('O',{ctrlKey:true,shiftKey:true}))).toBe(false);
    expect(shortcutChord(key('o',{ctrlKey:true,isComposing:true}))).toBe('');
    expect(shortcutChord(key('o',{ctrlKey:true,keyCode:229}))).toBe('');
  });
});
