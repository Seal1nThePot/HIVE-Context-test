import { describe, expect, it } from 'vitest';
import { filterPanels, groupPanels, panelCategory, panelCategories, type PanelItem } from './panelCatalog';

describe('panel catalog',()=>{
  const items:PanelItem[]=Array.from({length:50},(_,i)=>({id:`p${i}`,label:`面板 ${i}`,open:false,category:panelCategories[i%5].id}));
  it('partitions 50 panels without loss',()=>{
    const groups=groupPanels(items);
    expect(Object.values(groups).flat()).toHaveLength(50);
    expect(new Set(Object.values(groups).flat().map(item=>item.id)).size).toBe(50);
    expect(panelCategories.map(c=>groups[c.id].length)).toEqual([10,10,10,10,10]);
  });
  it('searches aliases and filenames globally',()=>{
    const entry:PanelItem={id:'editor',label:'正文',open:true,description:'章节.md',keywords:['写稿']};
    expect(filterPanels([entry],'ai','章节.md')).toEqual([entry]);
    expect(filterPanels([entry],'all','写稿')).toEqual([entry]);
  });
  it('filters category and assigns unknown ids to tools',()=>{
    expect(filterPanels(items,'ai','')).toHaveLength(10);
    expect(panelCategory({id:'unknown',label:'未知',open:false})).toBe('tools');
    expect(['trash','editor:2','scratch','conversation'].map(id=>panelCategory({id,label:id,open:false}))).toEqual(['files','documents','writing','ai']);
  });
});
