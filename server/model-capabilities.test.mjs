import {describe,it,expect} from 'vitest';
import {catalogCapabilities,cleanCapabilities,effectiveInputTypes} from './model-capabilities';

describe('model input capabilities',()=>{
  it('maps declared input types and ignores unknown ones',()=>{
    expect(cleanCapabilities({input:['image','text','audio']})).toEqual({input:['text','image']});
    expect(catalogCapabilities({architecture:{input_modalities:['text','image']}})).toEqual({input:['text','image']});
    expect(catalogCapabilities({input_modalities:['text']})).toEqual({input:['text']});
  });
  it('keeps input types next to reasoning and token limits',()=>{
    const capabilities=catalogCapabilities({architecture:{input_modalities:['text','image']},context_length:8192,max_completion_tokens:2048});
    expect(capabilities).toEqual({contextTokens:8192,maxOutputTokens:2048,input:['text','image']});
    expect(effectiveInputTypes({capabilities})).toEqual(['text','image']);
  });
});
