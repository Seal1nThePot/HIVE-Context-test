import {describe,expect,it} from 'vitest';
import {readPanelIconDragPreferences} from './usePanelIconDragPreferences';
describe('panel icon drag preferences',()=>{
  it.each(['circle','bar'])('restores %s and ignores unrelated data',holdStyle=>{
    expect(readPanelIconDragPreferences(JSON.stringify({version:1,holdStyle,text:'不要缓存正文'}))).toEqual({version:1,holdStyle,holdDelayMs:1000,minimumTriggerMs:200});
  });
  it.each([50,100,200,500,1000,3000])('restores valid delay %i ms',holdDelayMs=>{expect(readPanelIconDragPreferences(JSON.stringify({version:1,holdStyle:'bar',holdDelayMs}))).toEqual({version:1,holdStyle:'bar',holdDelayMs,minimumTriggerMs:200});});
  it.each([0,49,3001,-1,'1000',null])('defaults invalid delay %s without losing style',holdDelayMs=>{expect(readPanelIconDragPreferences(JSON.stringify({version:1,holdStyle:'bar',holdDelayMs}))).toEqual({version:1,holdStyle:'bar',holdDelayMs:1000,minimumTriggerMs:200});});
  it.each([50,200,500,3000])('restores minimum %i ms',minimumTriggerMs=>{expect(readPanelIconDragPreferences(JSON.stringify({version:1,holdStyle:'bar',minimumTriggerMs}))).toEqual({version:1,holdStyle:'bar',holdDelayMs:1000,minimumTriggerMs});});
  it.each([0,49,3001,'200',null])('defaults invalid minimum %s',minimumTriggerMs=>{expect(readPanelIconDragPreferences(JSON.stringify({version:1,holdStyle:'bar',holdDelayMs:100,minimumTriggerMs}))).toEqual({version:1,holdStyle:'bar',holdDelayMs:100,minimumTriggerMs:200});});
  it.each([null,'broken','{"version":2,"holdStyle":"bar"}','{"version":1,"holdStyle":"other"}','{"version":1}'])('defaults invalid input %s',raw=>{
    expect(readPanelIconDragPreferences(raw)).toEqual({version:1,holdStyle:'circle',holdDelayMs:1000,minimumTriggerMs:200});
  });
});
