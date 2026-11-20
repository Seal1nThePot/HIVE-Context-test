import {z} from 'zod';
import {modelTool} from './model-tools.mjs';

const findOptions=z.strictObject({
  query:z.string().min(1).max(512).describe('笔记内查找的字面文本。'),
  caseSensitive:z.boolean().optional().describe('用户要求区分大小写时设为 true。'),
  wholeWord:z.boolean().optional().describe('仅在用户明确要求完整词匹配时设为 true。'),
});
export const findNoteTool=modelTool('find_note','在已经绑定的笔记里查找具体文字，返回行、列和匹配位置。',findOptions);

const matchLimit=100;
export function findInNote(text,{query,caseSensitive=false,wholeWord=false}){
  const literal=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=wholeWord?String.raw`(?<![\p{L}\p{N}\p{M}_])${literal}(?![\p{L}\p{N}\p{M}_])`:literal;
  const matches=[];
  let line=1,lineStart=0,nextLine=text.indexOf('\n');
  for(const match of text.matchAll(new RegExp(pattern,caseSensitive?'gu':'giu'))){
    if(matches.length===matchLimit)return {query,matches,truncated:true};
    const from=match.index,to=from+match[0].length;
    while(nextLine!==-1&&nextLine<from){
      line++;
      lineStart=nextLine+1;
      nextLine=text.indexOf('\n',lineStart);
    }
    const lineEnd=nextLine===-1?text.length:nextLine;
    const start=Math.max(lineStart,from-48),end=Math.min(lineEnd,from+120);
    const snippet=(start===lineStart?'':'…')+text.slice(start,end).replace(/\r$/,'')+(end<lineEnd||to>lineEnd?'…':'');
    matches.push({line,column:from-lineStart+1,from,to,snippet});
  }
  return {query,matches,truncated:false};
}
