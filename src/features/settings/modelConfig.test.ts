import {describe,it,expect} from 'vitest';
import {defaultImportedReasoningLevels,effectiveInputTypes,effectiveReasoningLevels,withImportedReasoningDefaults,type ModelEntry} from './modelConfig';

describe('imported model defaults',()=>{
  it('gives a freshly imported model the four default reasoning levels',()=>{
    const imported=withImportedReasoningDefaults({id:'m',name:'m'});
    expect(defaultImportedReasoningLevels).toEqual(['low','medium','high','max']);
    expect(imported.manualReasoningLevels).toEqual(['low','medium','high','max']);
    expect(effectiveReasoningLevels(imported)).toEqual(['low','medium','high','max']);
  });
  it('keeps upstream-declared levels and explicit manual choices untouched',()=>{
    const upstream:ModelEntry={id:'a',name:'a',capabilities:{reasoning:{high:{parameter:'reasoning_effort',value:'high'}}}};
    expect(withImportedReasoningDefaults(upstream)).toBe(upstream);
    const cleared:ModelEntry={id:'b',name:'b',manualReasoningLevels:[]};
    expect(withImportedReasoningDefaults(cleared).manualReasoningLevels).toEqual([]);
  });
});

describe('effective input types',()=>{
  it('falls back to text when nothing is declared',()=>{
    expect(effectiveInputTypes(undefined)).toEqual(['text']);
    expect(effectiveInputTypes({id:'m',name:'m'})).toEqual(['text']);
  });
  it('prefers the manual selection over the upstream capabilities',()=>{
    const model:ModelEntry={id:'m',name:'m',capabilities:{input:['text','image']}};
    expect(effectiveInputTypes(model)).toEqual(['text','image']);
    expect(effectiveInputTypes({...model,inputTypes:['text']})).toEqual(['text']);
  });
});
