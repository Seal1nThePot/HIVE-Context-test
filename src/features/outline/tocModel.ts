import type {Heading} from '../../shared/core';

export type TocRow={key:string;heading:Heading;depth:number;hasChildren:boolean;parent:number|null};
export function tocRows(headings:Heading[],collapsed:ReadonlySet<string>):TocRow[]{
  const rows:TocRow[]=[],ancestors:{heading:Heading;key:string}[]=[],occurrences=new Map<string,number>();
  for(let index=0;index<headings.length;index++){
    const heading=headings[index];
    while(ancestors.length&&ancestors.at(-1)!.heading.level>=heading.level)ancestors.pop();
    const count=(occurrences.get(heading.title)||0)+1;occurrences.set(heading.title,count);
    const key=JSON.stringify([...ancestors.map(item=>item.heading.title),heading.title,count]);
    if(!ancestors.some(item=>collapsed.has(item.key)))rows.push({key,heading,depth:ancestors.length,parent:ancestors.at(-1)?.heading.from??null,hasChildren:!!headings[index+1]&&headings[index+1].level>heading.level});
    ancestors.push({heading,key});
  }
  return rows;
}
