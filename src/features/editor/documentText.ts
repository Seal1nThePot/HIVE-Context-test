import type {Text} from '@codemirror/state';

const comparisons=new WeakMap<Text,{text:string;equal:boolean}>();

/** Compare the rope with a save baseline without allocating another whole document. */
export function documentMatchesText(doc:Text,text:string){
  const cached=comparisons.get(doc);
  if(cached?.text===text)return cached.equal;
  let equal=doc.length===text.length,offset=0;
  if(equal){
    const cursor=doc.iter();
    while(!cursor.next().done){if(!text.startsWith(cursor.value,offset)){equal=false;break;}offset+=cursor.value.length;}
  }
  comparisons.set(doc,{text,equal});return equal;
}
