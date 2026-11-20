import {StateEffect,StateField,type EditorState,type Range} from '@codemirror/state';
import {BlockType,Decoration,EditorView,WidgetType,type BlockInfo,type DecorationSet} from '@codemirror/view';
import {markdownTree} from './markdownParse';
import {previewPlan} from './markdownPresentation';
import {tableSegments} from './tableViewport';

/** Extra space is a visual line decoration, never document text or history. */
export type AlignmentPadding=ReadonlyMap<number,number>;
export const setSplitPadding=StateEffect.define<AlignmentPadding>();
export const splitPadding=StateField.define<AlignmentPadding>({
  create:()=>new Map(),
  update(value,tr){
    if(tr.docChanged){const mapped=new Map<number,number>();for(const [pos,height] of value){const next=tr.changes.mapPos(pos);const line=tr.state.doc.lineAt(next);if(line.from===next)mapped.set(next,height);}value=mapped;}
    for(const effect of tr.effects)if(effect.is(setSplitPadding))value=effect.value;
    return value;
  },
  provide:field=>EditorView.decorations.from(field,(pads:AlignmentPadding):DecorationSet=>{
    const ranges:Range<Decoration>[]=[];
    for(const [from,height] of pads)if(height>0.5)ranges.push(Decoration.line({attributes:{style:`--split-alignment-padding:${height}px`}}).range(from));
    return Decoration.set(ranges,true);
  }),
});

export const setSplitTopPadding=StateEffect.define<AlignmentPadding>();
export const splitTopPadding=StateField.define<AlignmentPadding>({
  create:()=>new Map(),
  update(value,tr){
    if(tr.docChanged){const mapped=new Map<number,number>();for(const [pos,height] of value){const next=tr.changes.mapPos(pos);if(tr.state.doc.lineAt(next).from===next)mapped.set(next,height);}value=mapped;}
    for(const effect of tr.effects)if(effect.is(setSplitTopPadding))value=effect.value;
    return value;
  },
  provide:field=>EditorView.decorations.from(field,(pads:AlignmentPadding)=>Decoration.set([...pads].filter(([,height])=>height>.5).map(([pos,height])=>Decoration.line({attributes:{style:`--split-alignment-before:${height}px`}}).range(pos)),true)),
});

class AlignmentBlock extends WidgetType{
  constructor(readonly height:number){super();}
  eq(other:AlignmentBlock){return this.height===other.height;}
  get estimatedHeight(){return this.height;}
  toDOM(view:EditorView){const el=view.dom.ownerDocument.createElement('div');el.className='cm-split-alignment-block';el.style.height=`${this.height}px`;el.setAttribute('aria-hidden','true');return el;}
}
export const setSplitBlockPadding=StateEffect.define<AlignmentPadding>();
export const splitBlockPadding=StateField.define<AlignmentPadding>({
  create:()=>new Map(),
  update(value,tr){
    if(tr.docChanged){
      const mapped=new Map<number,number>();
      for(const [pos,height] of value){
        const next=tr.changes.mapPos(pos,-1);
        if(tr.state.doc.lineAt(next).to===next)mapped.set(next,height);
      }
      value=mapped;
    }
    for(const effect of tr.effects)if(effect.is(setSplitBlockPadding))value=effect.value;
    return value;
  },
  provide:field=>EditorView.decorations.from(field,(pads:AlignmentPadding):DecorationSet=>Decoration.set([...pads].filter(([,height])=>height>.5).map(([pos,height])=>Decoration.widget({widget:new AlignmentBlock(height),block:true,side:1}).range(pos)),true)),
});

/** Return nonnegative additions to equalize two measured blocks, excluding prior additions. */
export function alignmentDelta(leftHeight:number,rightHeight:number,leftPadding=0,rightPadding=0){
  const left=Math.max(0,leftHeight-leftPadding),right=Math.max(0,rightHeight-rightPadding),difference=right-left;
  return {left:Math.max(0,difference),right:Math.max(0,-difference)};
}

// A hidden source-only line (such as a fence) shares a visual block with
// the following text. Its space belongs before the text, not after the block.
function textAfterHiddenPrefix(block:BlockInfo){
  const parts=block.type;
  if(!Array.isArray(parts))return;
  const text=parts.findIndex(part=>part.type===BlockType.Text);
  if(text>0&&parts.slice(0,text).every(part=>part.type===BlockType.WidgetRange&&part.height<.5))return parts[text];
}

function endsInBlockReplacement(block:BlockInfo){
  const parts=block.type;
  if(!Array.isArray(parts))return parts===BlockType.WidgetRange;
  // CodeMirror includes our zero-width padding widget as another block part.
  // Its presence must not change where the next measurement puts that padding.
  return parts.findLast(part=>!(part.widget instanceof AlignmentBlock))?.type===BlockType.WidgetRange;
}

/** Soft line breaks belong to the same Markdown paragraph in both panes. */
export function paragraphLines(state:EditorState,pos:number){
  const line=state.doc.lineAt(pos);
  if(!line.length)return {first:line,last:line};
  let node=markdownTree(state).resolve(line.to,-1);
  while(node.name!=='Paragraph'&&node.parent)node=node.parent;
  return node.name==='Paragraph'
    ?{first:state.doc.lineAt(node.from),last:state.doc.lineAt(node.to)}
    :{first:line,last:line};
}

/** Align paragraph boundaries while each pane wraps its own content. */
export function alignSplitViews(source:EditorView,main:EditorView,correctScroll:()=>void=()=>{}){
  const window=main.dom.ownerDocument.defaultView!;
  let frame=0,releaseTimer=0,disposed=false,composing=false;
  const observer=new window.ResizeObserver(()=>schedule());
  observer.observe(source.scrollDOM);observer.observe(main.scrollDOM);observer.observe(source.contentDOM);observer.observe(main.contentDOM);
  const start=()=>{composing=true;},end=()=>{composing=false;if(releaseTimer)window.clearTimeout(releaseTimer);releaseTimer=window.setTimeout(()=>{releaseTimer=0;schedule();},0);};
  const layout=()=>schedule();
  for(const view of [source,main]){view.dom.addEventListener('compositionstart',start,true);view.dom.addEventListener('compositionend',end,true);view.dom.addEventListener('load',layout,true);view.scrollDOM.addEventListener('scroll',layout,{passive:true});}
  window.addEventListener('resize',layout);
  function schedule(){if(disposed||frame||composing)return;if(source.composing||main.composing){if(!releaseTimer)releaseTimer=window.setTimeout(()=>{releaseTimer=0;schedule();},50);return;}frame=window.requestAnimationFrame(measure);}
  function measure(){
    frame=0;if(disposed||!source.state.doc.eq(main.state.doc))return;
    if(composing||source.composing||main.composing){schedule();return;}
    if(!source.scrollDOM.clientHeight||!main.scrollDOM.clientHeight)return;
    const sourceBlocks=source.viewportLineBlocks,mainBlocks=main.viewportLineBlocks;if(!sourceBlocks.length||!mainBlocks.length)return;
    const doc=main.state.doc;
    const starts=new Set<number>();
    for(const block of [...sourceBlocks,...mainBlocks])starts.add(paragraphLines(main.state,block.from).first.number);
    const visibleNumbers=[...starts].sort((a,b)=>a-b);
    const currentSource=source.state.field(splitPadding),currentMain=main.state.field(splitPadding),currentBlock=main.state.field(splitBlockPadding),sourceTop=source.state.field(splitTopPadding),mainTop=main.state.field(splitTopPadding);
    const nextSource=new Map(currentSource),nextMain=new Map(currentMain),nextBlock=new Map(currentBlock),nextSourceTop=new Map(sourceTop),nextMainTop=new Map(mainTop);
    const tables=previewPlan(main.state).replacements.filter(item=>item.kind==='table');
    let rowStylesChanged=false;
    let coveredUntil=0;
    for(const n of visibleNumbers){
      if(n<=coveredUntil)continue;
      const line=doc.line(n),left=source.lineBlockAt(line.from),right=main.lineBlockAt(line.from);
      if(left.from!==line.from||right.from!==line.from)continue;
      const paragraph=paragraphLines(main.state,line.from);
      const renderedTail=main.lineBlockAt(paragraph.last.from);
      const lastLine=doc.lineAt(Math.max(right.to,renderedTail.to)),groupEnd=lastLine.number;
      if(Math.max(right.to,renderedTail.to)!==lastLine.to)continue;
      const table=tables.find(item=>tableSegments(item,doc).some(segment=>segment.from===right.from&&segment.to===right.to));
      if(table){
        const segment=tableSegments(table,doc).find(item=>item.from===right.from&&item.to===right.to)!;
        const root=[...main.contentDOM.querySelectorAll<HTMLElement>('[data-table-widget]')].find(el=>Number(el.dataset.tableOrdinal)===table.tableOrdinal&&Number(el.dataset.tableSegment||0)===segment.fromRow);
        const rows=root?[...root.querySelectorAll<HTMLElement>('tr[data-row]')]:[];
        if(root&&rows.length===segment.toRow-segment.fromRow){
          const quantize=(value:number)=>Math.round(Math.max(0,value)*4)/4;
          const first=rows[0].getBoundingClientRect(),rootRect=root.getBoundingClientRect();
          const before=quantize(first.top-rootRect.top);
          nextSourceTop.set(line.from,before);nextMainTop.delete(line.from);
          for(const row of rows){
            const index=Number(row.dataset.row),cell=table.rows?.[index]?.[0];if(!cell)continue;
            const rowLine=doc.lineAt(cell.from),endLine=index===0?doc.line(Math.min(doc.lines,rowLine.number+1)):rowLine;
            const startBlock=source.lineBlockAt(rowLine.from),endBlock=source.lineBlockAt(endLine.from);
            let previous=0;for(let number=rowLine.number;number<=endLine.number;number++){const pos=doc.line(number).from;previous+=currentSource.get(pos)||0;nextSource.delete(pos);}
            const oldExtra=parseFloat(row.style.getPropertyValue('--split-table-extra'))||0;
            const sourceBase=endBlock.bottom-startBlock.top-previous-(rowLine.from===line.from?(sourceTop.get(line.from)||0):0);
            const rowBase=row.getBoundingClientRect().height-oldExtra;
            const delta=alignmentDelta(sourceBase,rowBase);
            nextSource.set(endLine.from,quantize(delta.left));
            const extra=quantize(delta.right);
            if(Math.abs(oldExtra-extra)>.5){row.style.setProperty('--split-table-extra',`${extra}px`);rowStylesChanged=true;}
          }
          // The table's outer bottom margin is not a document row.
          const after=quantize(rootRect.bottom-rows[rows.length-1].getBoundingClientRect().bottom);
          nextSource.set(lastLine.from,(nextSource.get(lastLine.from)||0)+after);
          nextBlock.delete(right.to);nextMain.delete(line.from);coveredUntil=groupEnd;continue;
        }
      }
      const tail=source.lineBlockAt(lastLine.from);
      if(tail.to!==lastLine.to)continue;
      let oldSource=0,oldMain=0;
      for(let number=n;number<=groupEnd;number++){
        const pos=doc.line(number).from;
        oldSource+=(currentSource.get(pos)||0)+(sourceTop.get(pos)||0);
        oldMain+=(currentMain.get(pos)||0)+(mainTop.get(pos)||0);
        nextSource.delete(pos);nextMain.delete(pos);
      }
      const multi=right.from!==renderedTail.from||right.to!==renderedTail.to||right.to!==line.to;
      const blockWidget=endsInBlockReplacement(renderedTail);
      if(blockWidget)oldMain+=currentBlock.get(lastLine.to)||0;
      const exposed=textAfterHiddenPrefix(right);
      const mainLine=exposed?doc.lineAt(exposed.from):line;
      const oldSourceTop=sourceTop.get(line.from)||0,oldMainTop=mainTop.get(mainLine.from)||0;
      let newSourceTop=oldSourceTop,newMainTop=oldMainTop;
      // Only the first visible text of the block is measured. Wrapped rows
      // inside a paragraph never participate in the alignment.
      if(!multi||exposed||right.to===line.to){
        const limit=Math.min(mainLine.to,mainLine.from+64);
        const sourceVisible=source.visibleRanges.some(range=>range.from<=mainLine.from&&range.to>mainLine.from);
        const mainVisible=main.visibleRanges.some(range=>range.from<=mainLine.from&&range.to>mainLine.from);
        if(sourceVisible&&mainVisible){
          for(let pos=mainLine.from;pos<limit;pos++){
            const a=source.coordsForChar(pos),b=main.coordsForChar(pos);
            if(!a||!b)continue;
            const sourceOffset=a.top-source.documentTop-left.top-oldSourceTop;
            const mainOffset=b.top-main.documentTop-right.top-oldMainTop;
            newSourceTop=Math.max(0,mainOffset-sourceOffset);
            newMainTop=Math.max(0,sourceOffset-mainOffset);
            break;
          }
        }
      }
      const quantize=(value:number)=>Math.round(value*4)/4;
      for(let number=n+1;number<=groupEnd;number++){
        const pos=doc.line(number).from;
        if(pos!==mainLine.from)nextMainTop.delete(pos);
        nextSourceTop.delete(pos);
      }
      nextSourceTop.set(line.from,quantize(newSourceTop));
      if(mainLine.from!==line.from)nextMainTop.delete(line.from);
      nextMainTop.set(mainLine.from,quantize(newMainTop));
      const padding=alignmentDelta(tail.bottom-left.top+newSourceTop,
        Math.max(right.bottom,renderedTail.bottom)-right.top+newMainTop,oldSource,oldMain);
      nextSource.set(lastLine.from,quantize(padding.left));
      if(blockWidget)nextBlock.set(lastLine.to,quantize(padding.right));
      else{nextMain.set(lastLine.from,quantize(padding.right));nextBlock.delete(lastLine.to);}
      coveredUntil=groupEnd;
    }
    const changed=(a:AlignmentPadding,b:AlignmentPadding)=>a.size!==b.size||[...b].some(([key,value])=>Math.abs((a.get(key)||0)-value)>.5);
    const sourceEffects=[];if(changed(currentSource,nextSource))sourceEffects.push(setSplitPadding.of(nextSource));if(changed(sourceTop,nextSourceTop))sourceEffects.push(setSplitTopPadding.of(nextSourceTop));if(sourceEffects.length)source.update([source.state.update({effects:sourceEffects})]);
    const effects=[];if(changed(currentMain,nextMain))effects.push(setSplitPadding.of(nextMain));if(changed(mainTop,nextMainTop))effects.push(setSplitTopPadding.of(nextMainTop));if(changed(currentBlock,nextBlock))effects.push(setSplitBlockPadding.of(nextBlock));if(effects.length)main.dispatch({effects});
    if(sourceEffects.length||effects.length||rowStylesChanged){
      // Moving padding between the start and end can leave the total content
      // size intact, so a ResizeObserver notification is not guaranteed.
      source.requestMeasure();main.requestMeasure();schedule();correctScroll();
    }
    window.requestAnimationFrame(()=>{if(!disposed)correctScroll();});
  }
  schedule();
  return {schedule,dispose(){disposed=true;if(frame)window.cancelAnimationFrame(frame);if(releaseTimer)window.clearTimeout(releaseTimer);observer.disconnect();main.dom.querySelectorAll<HTMLElement>('tr[style*="--split-table-extra"]').forEach(row=>row.style.removeProperty('--split-table-extra'));window.removeEventListener('resize',layout);for(const view of [source,main]){view.dom.removeEventListener('compositionstart',start,true);view.dom.removeEventListener('compositionend',end,true);view.dom.removeEventListener('load',layout,true);view.scrollDOM.removeEventListener('scroll',layout);}}};
}
