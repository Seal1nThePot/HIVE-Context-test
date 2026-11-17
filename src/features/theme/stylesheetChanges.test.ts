import {afterEach,expect,it,vi} from 'vitest';
import {subscribeStylesheetChanges} from './stylesheetChanges';
afterEach(()=>vi.unstubAllGlobals());
it('shares hooks, preserves CSSOM results and errors, and restores the original methods',()=>{
  class Sheet{
    rules:string[]=[];
    insertRule(rule:string,index=this.rules.length){if(rule==='bad')throw new Error('invalid');this.rules.splice(index,0,rule);return index;}
    deleteRule(index:number){if(index>=this.rules.length)throw new Error('invalid');this.rules.splice(index,1);}
  }
  vi.stubGlobal('CSSStyleSheet',Sheet);const originalInsert=Sheet.prototype.insertRule,originalDelete=Sheet.prototype.deleteRule;
  const a=vi.fn(),b=vi.fn(),offA=subscribeStylesheetChanges(a),hook=Sheet.prototype.insertRule,offB=subscribeStylesheetChanges(b);
  expect(Sheet.prototype.insertRule).toBe(hook);
  const sheet=new Sheet();expect(sheet.insertRule('a')).toBe(0);sheet.deleteRule(0);
  expect(a).toHaveBeenCalledTimes(2);expect(b).toHaveBeenCalledTimes(2);expect(a).toHaveBeenCalledWith(sheet);
  expect(()=>sheet.insertRule('bad')).toThrow('invalid');expect(()=>sheet.deleteRule(0)).toThrow('invalid');expect(a).toHaveBeenCalledTimes(2);
  offA();sheet.insertRule('b');expect(a).toHaveBeenCalledTimes(2);expect(b).toHaveBeenCalledTimes(3);
  offB();expect(Sheet.prototype.insertRule).toBe(originalInsert);expect(Sheet.prototype.deleteRule).toBe(originalDelete);
});
