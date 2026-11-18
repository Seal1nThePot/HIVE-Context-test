import {StateEffect,StateField,type Range,type Text} from '@codemirror/state';
import {Decoration,EditorView,type DecorationSet} from '@codemirror/view';

/** 已经写进正文的一段 AI 建议：文字本身在文档里，这里只描述它占的位置和来历。 */
export type InlineProposal={from:number;to:number;mode:string;count:number;text:string;original:string;reason:string;stale:boolean;node:string};

export const setInlineProposal=StateEffect.define<InlineProposal|null>();

/** 给这段文字描一圈细线：逐行挂 line decoration，第一行封口、最后一行封底，多行时左右两条线自然接上。 */
function boxDecorations(proposal:InlineProposal|null,doc:Text):DecorationSet{
  if(!proposal)return Decoration.none;
  const from=Math.max(0,Math.min(proposal.from,doc.length));
  const to=Math.max(from,Math.min(proposal.to,doc.length));
  if(to<=from)return Decoration.none;
  // 建议文本可能带着段首空行（续写是在文末追加 "\n\n"），框只圈真正的文字。
  const text=doc.sliceString(from,to);
  const lead=text.length-text.trimStart().length;
  const trail=text.length-text.trimEnd().length;
  const boxFrom=from+lead;
  const boxTo=Math.max(boxFrom,to-trail);
  if(boxTo<=boxFrom)return Decoration.none;
  const first=doc.lineAt(boxFrom).number;
  const last=doc.lineAt(boxTo-1).number;
  const decorations:Range<Decoration>[]=[];
  for(let number=first;number<=last;number+=1){
    const classes=['proposal-box'];
    if(number===first)classes.push('proposal-box-first');
    if(number===last)classes.push('proposal-box-last');
    if(proposal.stale)classes.push('proposal-box-stale');
    decorations.push(Decoration.line({class:classes.join(' ')}).range(doc.line(number).from));
  }
  return Decoration.set(decorations,true);
}

export type InlineProposalState={proposal:InlineProposal|null;decorations:DecorationSet};

export const inlineProposalField=StateField.define<InlineProposalState>({
  create:()=>({proposal:null,decorations:Decoration.none}),
  update(value,transaction){
    let proposal=value.proposal;
    let decorations=value.decorations.map(transaction.changes);
    // 用户在上方增删文字时，框和横条要跟着这段建议一起移动。
    if(proposal&&transaction.docChanged){
      const from=transaction.changes.mapPos(proposal.from,1);
      const to=transaction.changes.mapPos(proposal.to,-1);
      if(from!==proposal.from||to!==proposal.to)proposal={...proposal,from,to};
    }
    for(const effect of transaction.effects){
      if(!effect.is(setInlineProposal))continue;
      proposal=effect.value;
      decorations=boxDecorations(proposal,transaction.state.doc);
    }
    return {proposal,decorations};
  },
  provide:(field)=>EditorView.decorations.from(field,(value)=>value.decorations),
});