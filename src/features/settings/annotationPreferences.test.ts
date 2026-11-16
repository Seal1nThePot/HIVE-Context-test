import {describe,expect,it} from 'vitest';
import {readAnnotationPreferences} from './useAnnotationPreferences';

describe('annotation bubble preferences',()=>{
  it.each(['left','right','above','below'])('restores %s without retaining unrelated data',bubblePlacement=>{
    expect(readAnnotationPreferences(JSON.stringify({version:1,bubblePlacement,text:'不要缓存正文'}))).toEqual({version:1,bubblePlacement});
  });
  it.each([null,'broken','{"version":2,"bubblePlacement":"left"}','{"version":1,"bubblePlacement":"outside"}'])('uses a safe default for missing or invalid preference %s',raw=>{
    expect(readAnnotationPreferences(raw)).toEqual({version:1,bubblePlacement:'right'});
  });
});
