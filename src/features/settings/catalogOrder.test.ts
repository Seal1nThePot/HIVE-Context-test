import {it,expect} from 'vitest';
import {sortCatalogModels} from './catalogOrder';

const catalog=[
  {id:'kimi-k2-7',name:'Kimi K2.7 Code'},
  {id:'ds-v4-pro',name:'DeepSeek V4 Pro'},
  {id:'glm-5-3-flash',name:'GLM-5.3-Flash'},
  {id:'hy3',name:'Hy3'},
  {id:'grok-4-7',name:'Grok 4.7'},
  {id:'gpt-6',name:'GPT-6 Luna'},
  {id:'claude-haiku-5-5',name:'Claude Haiku 5.5'},
  {id:'ds-v4-1',name:'DeepSeek V4.1 Flash 1017'},
  {id:'glm-5-2',name:'GLM-5.2'},
  {id:'glm-5-3',name:'GLM-5.3'},
  {id:'hy4',name:'Hy4 preview'},
];

it('orders the model catalog alphabetically by display name',()=>{
  expect(sortCatalogModels(catalog).map(m=>m.name)).toEqual([
    'Claude Haiku 5.5','DeepSeek V4 Pro','DeepSeek V4.1 Flash 1017','GLM-5.2','GLM-5.3','GLM-5.3-Flash',
    'GPT-6 Luna','Grok 4.7','Hy3','Hy4 preview','Kimi K2.7 Code',
  ]);
});

it('sorts numerically inside a version and ignores case',()=>{
  const list=[{id:'b',name:'glm-5.10'},{id:'a',name:'GLM-5.9'},{id:'c',name:'Glm-5.2'}];
  expect(sortCatalogModels(list).map(m=>m.name)).toEqual(['Glm-5.2','GLM-5.9','glm-5.10']);
});

it('falls back to the id for unnamed models and leaves the input untouched',()=>{
  const list=[{id:'zeta'},{id:'alpha'},{id:'mid',name:'Beta'}];
  expect(sortCatalogModels(list).map(m=>m.id)).toEqual(['alpha','mid','zeta']);
  expect(list.map(m=>m.id)).toEqual(['zeta','alpha','mid']);
});
