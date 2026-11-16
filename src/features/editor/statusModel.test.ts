import {describe,it,expect} from 'vitest';
import {defaultStatus,normalizeStatus,normalizeStatusOptions,placeStatusItem,readStatusOptions,textStatistics} from './statusModel';
const storage=(records:Record<string,string>)=>({getItem:(key:string)=>records[key]??null});
describe('editor status preferences',()=>{
  it('defaults to characters only and preserves deliberate empty preferences',()=>{
    expect(readStatusOptions(storage({}))).toEqual({items:['count'],countMode:'characters'});
    expect(normalizeStatusOptions({items:[],countMode:'text'})).toEqual({items:[],countMode:'text'});
    expect(defaultStatus).toEqual(['count']);
  });
  it('retains user order, removes unknown and duplicate keys, and supports paragraphs',()=>{
    expect(normalizeStatus(['paragraphs','count','save','paragraphs','obsolete',12])).toEqual(['paragraphs','count','save']);
  });
  it('reads the new format, migrates both previous formats without resetting user choices',()=>{
    expect(readStatusOptions(storage({'hive.editor-status.v3':JSON.stringify({version:3,items:['paragraphs','count'],countMode:'text'}),'hive.editor-status.v2':'["encoding"]'}))).toEqual({items:['paragraphs','count'],countMode:'text'});
    expect(readStatusOptions(storage({'hive.editor-status.v2':'["encoding","count"]'}))).toEqual({items:['encoding','count'],countMode:'characters'});
    expect(readStatusOptions(storage({'hive.editor-status.v1':'["lines","count"]'}))).toEqual({items:['save','lines','count'],countMode:'characters'});
    expect(readStatusOptions(storage({'hive.editor-status.v3':'{broken','hive.editor-status.v2':'[]'}))).toEqual({items:[],countMode:'characters'});
  });
  it('inserts available items and reorders existing ones without duplication or mutating the original',()=>{
    const items=['save','count','encoding'] as const;
    expect(placeStatusItem([...items],'paragraphs',1)).toEqual(['save','paragraphs','count','encoding']);
    expect(placeStatusItem([...items],'save',3)).toEqual(['count','encoding','save']);
    expect(placeStatusItem([...items],'encoding',0)).toEqual(['encoding','save','count']);
    expect(placeStatusItem([...items],'count',1)).toEqual(items);
    expect(items).toEqual(['save','count','encoding']);
  });
});
describe('writing status statistics',()=>{
  it('distinguishes visible characters from text and numbers while excluding Markdown and whitespace',()=>{
    expect(textStatistics('# 你\n\n**好**，A1🙂 !')).toEqual({characters:7,pureCount:4,paragraphs:2});
    expect(textStatistics('[中文](https://example.test/path) <u>A1</u>')).toMatchObject({characters:4,pureCount:4});
    expect(textStatistics('𠮷\tA\n🙂')).toMatchObject({characters:3,pureCount:2});
  });
  it('counts headings, list items and quoted paragraphs while ignoring code blocks and blank lines',()=>{
    expect(textStatistics('# 标题\n\n第一段\n换行仍是同段\n\n- 列表一\n- [x] 列表二\n\n> 引用\n\n```js\nconst x=1;\n```').paragraphs).toBe(5);
    expect(textStatistics('标题\n====\n\n段落\n\n\n另一段').paragraphs).toBe(3);
    expect(textStatistics('```\n代码\n```').paragraphs).toBe(0);
    expect(textStatistics('#\n\n- [ ] ').paragraphs).toBe(0);
    expect(textStatistics('\n \t\n')).toEqual({characters:0,pureCount:0,paragraphs:0});
  });
});
