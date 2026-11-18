import {it,expect} from 'vitest';
import {composerKeyAction} from './composerKeys';
const keys=(over:{key?:string;shiftKey?:boolean;ctrlKey?:boolean;metaKey?:boolean;isComposing?:boolean;disabled?:boolean;text?:string}={})=>({key:'Enter',shiftKey:false,ctrlKey:false,metaKey:false,isComposing:false,disabled:false,text:'写一段话',...over});
it('sends on bare Enter and keeps Shift+Enter for a newline',()=>{
  expect(composerKeyAction(keys())).toBe('send');
  expect(composerKeyAction(keys({shiftKey:true}))).toBe('newline');
  expect(composerKeyAction(keys({ctrlKey:true}))).toBe('send');
  expect(composerKeyAction(keys({metaKey:true}))).toBe('send');
});
it('never sends while an IME composition is active or the key is not Enter',()=>{
  expect(composerKeyAction(keys({isComposing:true}))).toBe('ignore');
  expect(composerKeyAction(keys({key:'a'}))).toBe('ignore');
  expect(composerKeyAction(keys({key:'Escape'}))).toBe('ignore');
});
it('ignores Enter when the draft is blank or the composer is disabled',()=>{
  expect(composerKeyAction(keys({text:'   '}))).toBe('ignore');
  expect(composerKeyAction(keys({disabled:true}))).toBe('ignore');
});
