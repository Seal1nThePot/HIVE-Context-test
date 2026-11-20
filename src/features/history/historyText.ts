import type {ChangeSet, Text, Transaction} from '@codemirror/state';
import type {HistorySection, HistoryTextPatch} from './historyTypes';

export function historyTextPatch(doc:Text,from:number,to:number,after:string):HistoryTextPatch {
  return {from,before:doc.sliceString(from,to),after,
    contextBefore:doc.sliceString(Math.max(from-32,0),from),contextAfter:doc.sliceString(to,Math.min(doc.length,to+32))};
}

export function historyTextChanges(transaction:Transaction) {
  return historyTextGroup(transaction.startState.doc,transaction.changes);
}

export function historyTextGroup(doc:Text,changes:ChangeSet){
  const changeset:{from:number;to:number;value:string}[]=[];
  changes.iterChanges((from,to,_fromB,_toB,inserted)=>changeset.push({from,to,value:inserted.toString()}));
  return changeset.map(({from,to,value},index)=>{
    const patch=historyTextPatch(doc,from,to,value);
    return {...patch,contextBefore:doc.sliceString(Math.max(from-32,changeset[index-1]?.to??0),from),
      contextAfter:doc.sliceString(to,Math.min(to+32,changeset[index+1]?.from??doc.length))};
  });
}

function uniqueIndex(text:string,pattern:string){
  if(!pattern)return -1;
  const index=text.indexOf(pattern);
  return index>=0&&text.indexOf(pattern,index+1)<0?index:-1;
}

export function planHistoryText(doc:Text,patches:HistoryTextPatch[],undo:boolean){
  const text=doc.toString(),conflicts:HistorySection[]=[];
  let delta=0;
  const changes=patches.map(patch=>{
    const expected=undo?patch.after:patch.before;
    const insert=undo?patch.before:patch.after;
    const nominal=patch.from+(undo?delta:0);
    delta+=patch.after.length-patch.before.length;
    const {contextBefore:left,contextAfter:right}=patch;
    const atNominal=text.slice(nominal,nominal+expected.length)===expected;
    const leftMatches=left?text.slice(nominal-left.length,nominal)===left:nominal===0;
    const rightMatches=right?text.slice(nominal+expected.length,nominal+expected.length+right.length)===right:nominal+expected.length===text.length;
    if(atNominal&&leftMatches&&rightMatches)return {from:nominal,to:nominal+expected.length,insert};
    const anchored=uniqueIndex(text,left+expected+right);
    if(anchored>=0&&(left||right))return {from:anchored+left.length,to:anchored+left.length+expected.length,insert};
    const before=left?uniqueIndex(text,left+expected):-1,after=right?uniqueIndex(text,expected+right):-1;
    const preceding=before<0?-1:before+left.length;
    if((preceding>=0&&after<0)||(after>=0&&preceding<0)||after>=0&&preceding===after){
      const from=Math.max(preceding,after);
      return {from,to:from+expected.length,insert};
    }
    const leftAnchor=left?uniqueIndex(text,left):-1,rightAnchor=right?uniqueIndex(text,right):-1;
    const from=leftAnchor>=0?leftAnchor+left.length:!left&&nominal===0?0:Math.max(0,Math.min(nominal,text.length));
    const to=rightAnchor>=from?rightAnchor:!right&&nominal+expected.length>=text.length?text.length:Math.min(text.length,from+expected.length);
    conflicts.push({title:'正文位置 '+(from+1),before:text.slice(from,to),after:insert});
    return {from,to,insert};
  }).sort((a,b)=>a.from-b.from);
  if(changes.some((change,index)=>index>0&&change.from<changes[index-1].to))throw new Error('正文中多处历史改动的位置已重叠，请手动核对差异。');
  return {changes,conflicts};
}
