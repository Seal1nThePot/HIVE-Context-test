import {StateEffect,StateField,Transaction,type Text,type Range} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,type DecorationSet} from '@codemirror/view';
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

/** Display-only line breaks follow the rendered text; copied and edited text remains unchanged. */
class ProjectedBreak extends WidgetType{
  constructor(readonly gap:number){super();}
  eq(other:ProjectedBreak){return this.gap===other.gap;}
  get lineBreaks(){return 1;}
  toDOM(view:EditorView){
    const element=view.dom.ownerDocument.createElement(this.gap>.5?'span':'br');element.className='cm-split-projected-break';
    if(this.gap>.5){element.style.display='block';element.style.height=`${this.gap}px`;element.setAttribute('aria-hidden','true');}
    return element;
  }
  ignoreEvent(){return false;}
}
export const setProjectedBreakGaps=StateEffect.define<AlignmentPadding>();
export const projectedBreakGaps=StateField.define<AlignmentPadding>({
  create:()=>new Map(),
  update(value,tr){
    if(tr.docChanged){const mapped=new Map<number,number>();for(const [pos,height] of value)mapped.set(tr.changes.mapPos(pos),height);value=mapped;}
    for(const effect of tr.effects)if(effect.is(setProjectedBreakGaps))value=effect.value;
    return value;
  },
});
export type ProjectedBreaks=ReadonlyMap<number,readonly number[]>;
export const setProjectedBreaks=StateEffect.define<ProjectedBreaks>();
export const projectedBreaks=StateField.define<ProjectedBreaks>({
  create:()=>new Map(),
  update(value,tr){
    if(tr.docChanged){const mapped=new Map<number,number[]>();for(const [line,breaks] of value){const next=tr.changes.mapPos(line),current=tr.state.doc.lineAt(next);if(current.from===next)mapped.set(next,[...new Set(breaks.map(pos=>tr.changes.mapPos(pos)).filter(pos=>pos>current.from&&pos<current.to))].sort((a,b)=>a-b));}value=mapped;}
    for(const effect of tr.effects)if(effect.is(setProjectedBreaks))value=effect.value;
    return value;
  },
  provide:field=>EditorView.decorations.compute([field,projectedBreakGaps],state=>{
    const ranges:Range<Decoration>[]=[],gaps=state.field(projectedBreakGaps);
    for(const breaks of state.field(field).values())for(const pos of breaks)ranges.push(Decoration.widget({widget:new ProjectedBreak(gaps.get(pos)||0),side:-1}).range(pos));
    return Decoration.set(ranges,true);
  }),
});

export type VirtualLineWindow={lineFrom:number;lineTo:number;from:number;to:number;before:number;after:number}|null;
export const setVirtualLineWindow=StateEffect.define<VirtualLineWindow>();
class VirtualGap extends WidgetType{
  constructor(readonly height:number){super();}
  eq(other:VirtualGap){return this.height===other.height;}
  get estimatedHeight(){return this.height;}
  toDOM(view:EditorView){const el=view.dom.ownerDocument.createElement('div');el.className='cm-split-virtual-gap';el.style.height=`${this.height}px`;el.setAttribute('aria-hidden','true');return el;}
}
export const virtualLineWindow=StateField.define<VirtualLineWindow>({
  create:()=>null,
  update(value,tr){
    if(value&&tr.docChanged)value={...value,lineFrom:tr.changes.mapPos(value.lineFrom),lineTo:tr.changes.mapPos(value.lineTo,1),from:tr.changes.mapPos(value.from),to:tr.changes.mapPos(value.to,1)};
    for(const effect of tr.effects)if(effect.is(setVirtualLineWindow))value=effect.value;
    return value;
  },
  provide:field=>EditorView.decorations.from(field,(window:VirtualLineWindow)=>{
    if(!window)return Decoration.none;const ranges:Range<Decoration>[]=[];
    if(window.from>window.lineFrom)ranges.push(Decoration.replace({block:true,inclusiveEnd:false,widget:new VirtualGap(window.before)}).range(window.lineFrom,window.from));
    if(window.to<window.lineTo)ranges.push(Decoration.replace({block:true,inclusiveStart:false,widget:new VirtualGap(window.after)}).range(window.to,window.lineTo));
    return Decoration.set(ranges,true);
  }),
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
    if(tr.docChanged)value=new Map();
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

/** Align visible, directly rendered logical lines; state and undo remain with the main editor. */
export function alignSplitViews(source:EditorView,main:EditorView,correctScroll:()=>void=()=>{}){
  const window=main.dom.ownerDocument.defaultView!;
  let frame=0,releaseTimer=0,disposed=false,composing=false;
  let revealTarget:number|null=null,revealFrames=0,revealStable=0;
  const cancelReveal=()=>{revealTarget=null;};
  for(const view of [source,main]){view.scrollDOM.addEventListener('wheel',cancelReveal,{passive:true});view.dom.addEventListener('pointerdown',cancelReveal,true);}
  type ProjectionJob={doc:Text;signature:string;pos:number;rowTop:number|null;seen:boolean;firstPos:number|null;screenFrom:number|null;screenTo:number|null;breaks:number[];gaps:Map<number,number>;complete:boolean};
  const jobs=new Map<number,ProjectionJob>();
  let lastDoc:Text|null=null,lastLayout="";
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
    // Visit only viewport blocks, even when the two views are temporarily far apart.
    const numbers=new Set<number>();for(const block of [...sourceBlocks,...mainBlocks])numbers.add(doc.lineAt(block.from).number);
    const visibleNumbers=[...numbers].sort((a,b)=>a-b),mainNumbers=new Set(mainBlocks.map(block=>doc.lineAt(block.from).number));
    const active=main.state.selection.ranges.map(range=>`${doc.lineAt(range.from).number}:${doc.lineAt(range.to).number}`).join(',');
    const style=window.getComputedStyle(main.contentDOM),scrollerStyle=window.getComputedStyle(main.scrollDOM);
    const layout=`${source.contentDOM.clientWidth}:${main.contentDOM.clientWidth}:${main.scaleY}:${main.defaultLineHeight}:${style.font}:${style.lineHeight}:${scrollerStyle.lineHeight}:${style.getPropertyValue('--hive-paragraph-spacing')}:${style.getPropertyValue('--hive-first-indent')}`;
    const geometry=`${layout}:${main.hasFocus?active:''}:${main.viewport.from}:${main.viewport.to}:${main.visibleRanges.map(range=>`${range.from}-${range.to}`).join(',')}`;
    if(lastDoc!==doc||lastLayout!==layout){
      const invalidate=lastDoc!==null;lastDoc=doc;lastLayout=layout;jobs.clear();
      if(invalidate&&(source.state.field(projectedBreaks).size||source.state.field(projectedBreakGaps).size||source.state.field(splitPadding).size||source.state.field(splitTopPadding).size||main.state.field(splitPadding).size||main.state.field(splitTopPadding).size||main.state.field(splitBlockPadding).size)){
        source.update([source.state.update({effects:[setProjectedBreaks.of(new Map()),setProjectedBreakGaps.of(new Map()),setSplitPadding.of(new Map()),setSplitTopPadding.of(new Map()),source.scrollSnapshot()],annotations:Transaction.addToHistory.of(false)})]);
        main.dispatch({effects:[setSplitPadding.of(new Map()),setSplitTopPadding.of(new Map()),setSplitBlockPadding.of(new Map()),main.scrollSnapshot()],annotations:Transaction.addToHistory.of(false)});
        source.requestMeasure();main.requestMeasure();schedule();return;
      }
    }
    // Read rendered character rectangles in bounded chunks, so a very long
    // logical line is eventually projected without blocking one frame forever.
    const currentBreaks=source.state.field(projectedBreaks),nextBreaks=new Map(currentBreaks),currentGaps=source.state.field(projectedBreakGaps),nextGaps=new Map(currentGaps);
    const visibleStarts=new Set<number>();let more=false,remaining=1000;
    for(const n of mainNumbers){
      const line=doc.line(n),block=main.lineBlockAt(line.from);visibleStarts.add(line.from);
      if(block.from!==line.from||block.to!==line.to)continue;
      const signature=`${geometry}:${line.to}:${block.height}:${line.length>8000?Math.floor(main.scrollDOM.scrollTop/150):''}`;
      let job=jobs.get(line.from);
      if(!job||job.doc!==doc||job.signature!==signature){job={doc,signature,pos:line.from,rowTop:null,seen:false,firstPos:null,screenFrom:null,screenTo:null,breaks:[],gaps:new Map(),complete:false};jobs.set(line.from,job);}
      const lineNode=main.domAtPos(line.from).node,lineElement=(lineNode.nodeType===1?lineNode as Element:lineNode.parentElement)?.closest('.cm-line');
      const rowHeight=parseFloat(lineElement?window.getComputedStyle(lineElement).lineHeight:style.lineHeight)||main.defaultLineHeight;
      const bounds=main.scrollDOM.getBoundingClientRect(),threshold=Math.max(3,rowHeight*.45),until=Math.min(line.to,job.pos+remaining),begin=job.pos;
      for(;job.pos<until;job.pos++){
        const rect=main.coordsForChar(job.pos);if(!rect)continue;
        job.seen=true;if(job.firstPos===null)job.firstPos=job.pos;
        if(rect.bottom>=bounds.top-100&&rect.top<=bounds.bottom+100){if(job.screenFrom===null)job.screenFrom=job.pos;job.screenTo=job.pos+1;}
        const top=rect.top-main.documentTop;
        if(job.rowTop===null)job.rowTop=top;
        else if(top>job.rowTop+threshold){job.breaks.push(job.pos);const gap=Math.max(0,Math.round((top-job.rowTop-rowHeight)*4)/4);if(gap>.5)job.gaps.set(job.pos,gap);job.rowTop=top;}
      }
      remaining-=job.pos-begin;job.complete=job.pos===line.to;
      if(job.complete){if(job.seen||!line.length){for(const pos of currentBreaks.get(line.from)||[])nextGaps.delete(pos);nextBreaks.set(line.from,job.breaks);for(const [pos,gap] of job.gaps)nextGaps.set(pos,gap);}}
      else more=true;
      if(remaining<=0){more=true;break;}
    }
    for(const key of jobs.keys())if(!visibleStarts.has(key))jobs.delete(key);
    if(more)schedule();
    const oldWindow=source.state.field(virtualLineWindow);
    const longPending=[...mainNumbers].some(n=>{const line=doc.line(n);return line.length>8000&&!jobs.get(line.from)?.complete;});
    let desiredWindow:VirtualLineWindow=longPending?oldWindow:null;
    for(const n of mainNumbers){
      const line=doc.line(n),job=jobs.get(line.from);if(line.length<=8000||!job?.complete||job.screenFrom===null||job.screenTo===null)continue;
      const firstRect=main.coordsForChar(job.screenFrom),lastRect=main.coordsForChar(job.screenTo-1),block=main.lineBlockAt(line.from);
      if(!firstRect||!lastRect)continue;
      desiredWindow={lineFrom:line.from,lineTo:line.to,from:job.screenFrom,to:job.screenTo,before:Math.max(0,firstRect.top-main.documentTop-block.top-7),after:Math.max(0,block.bottom-(lastRect.bottom-main.documentTop))};
      nextBreaks.set(line.from,job.breaks.filter(pos=>pos>job.screenFrom!&&pos<job.screenTo!));break;
    }
    const windowChanged=JSON.stringify(oldWindow)!==JSON.stringify(desiredWindow);
    if(windowChanged){source.update([source.state.update({effects:setVirtualLineWindow.of(desiredWindow)})]);source.requestMeasure();window.requestAnimationFrame(()=>{if(!disposed)correctScroll();});schedule();return;}
    const breaksChanged=currentBreaks.size!==nextBreaks.size||[...nextBreaks].some(([key,items])=>{const old=currentBreaks.get(key);return !old||old.length!==items.length||old.some((pos,index)=>pos!==items[index]);});
    const gapsChanged=currentGaps.size!==nextGaps.size||[...nextGaps].some(([pos,gap])=>Math.abs((currentGaps.get(pos)||0)-gap)>.5);
    if(breaksChanged||gapsChanged){source.update([source.state.update({effects:[setProjectedBreaks.of(nextBreaks),setProjectedBreakGaps.of(nextGaps)]})]);source.requestMeasure();window.requestAnimationFrame(()=>{if(!disposed)correctScroll();});schedule();return;}
    const currentSource=source.state.field(splitPadding),currentMain=main.state.field(splitPadding),currentBlock=main.state.field(splitBlockPadding),sourceTop=source.state.field(splitTopPadding),mainTop=main.state.field(splitTopPadding);
    const nextSource=new Map(currentSource),nextMain=new Map(currentMain),nextBlock=new Map(currentBlock),nextSourceTop=new Map(sourceTop),nextMainTop=new Map(mainTop);
    const tables=previewPlan(main.state).replacements.filter(item=>item.kind==='table');
    let rowStylesChanged=false;
    let coveredUntil=0;
    for(const n of visibleNumbers){
      if(n<=coveredUntil)continue;
      const line=doc.line(n),left=source.lineBlockAt(line.from),right=main.lineBlockAt(line.from);
      if(left.from!==line.from||right.from!==line.from)continue;
      const lastLine=doc.lineAt(right.to),groupEnd=lastLine.number;
      if(right.to!==lastLine.to)continue;
      const table=tables.find(item=>tableSegments(item,doc).some(segment=>segment.from===right.from&&segment.to===right.to));
      if(table){
        const segment=tableSegments(table,doc).find(item=>item.from===right.from&&item.to===right.to)!;
        const root=[...main.dom.querySelectorAll<HTMLElement>('[data-table-widget]')].find(el=>Number(el.dataset.tableOrdinal)===table.tableOrdinal&&Number(el.dataset.tableSegment||0)===segment.fromRow);
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
      if(tail.from!==lastLine.from||tail.to!==lastLine.to)continue;
      const sourceHeight=tail.bottom-left.top;let oldSource=0;
      for(const [pos,height] of currentSource)if(pos>=line.from&&pos<=lastLine.from){oldSource+=height;if(pos!==lastLine.from)nextSource.delete(pos);}
      const multi=groupEnd>n, oldMain=multi?(currentBlock.get(right.to)||0):(currentMain.get(line.from)||0);
      const oldSourceTop=sourceTop.get(line.from)||0,oldMainTop=mainTop.get(line.from)||0;
      let newSourceTop=0,newMainTop=0;
      const firstPos=jobs.get(line.from)?.firstPos;
      if(!multi&&firstPos!==undefined&&firstPos!==null){
        const a=source.coordsForChar(firstPos),b=main.coordsForChar(firstPos);
        if(a&&b){const sourceOffset=a.top-source.documentTop-left.top-oldSourceTop,mainOffset=b.top-main.documentTop-right.top-oldMainTop;
          newSourceTop=Math.max(0,mainOffset-sourceOffset);newMainTop=Math.max(0,sourceOffset-mainOffset);}
      }
      const quantize=(value:number)=>Math.round(value*4)/4;
      nextSourceTop.set(line.from,quantize(newSourceTop));nextMainTop.set(line.from,quantize(newMainTop));
      const padding=alignmentDelta(sourceHeight-oldSourceTop+newSourceTop,right.height-oldMainTop+newMainTop,oldSource,oldMain);
      nextSource.set(lastLine.from,quantize(padding.left));
      if(multi){nextBlock.set(right.to,quantize(padding.right));nextMain.delete(line.from);}
      else{nextMain.set(line.from,quantize(padding.right));nextBlock.delete(right.to);}
      coveredUntil=groupEnd;
    }
    const changed=(a:AlignmentPadding,b:AlignmentPadding)=>a.size!==b.size||[...b].some(([key,value])=>Math.abs((a.get(key)||0)-value)>.5);
    const sourceEffects=[];if(changed(currentSource,nextSource))sourceEffects.push(setSplitPadding.of(nextSource));if(changed(sourceTop,nextSourceTop))sourceEffects.push(setSplitTopPadding.of(nextSourceTop));if(sourceEffects.length)source.update([source.state.update({effects:sourceEffects})]);
    const effects=[];if(changed(currentMain,nextMain))effects.push(setSplitPadding.of(nextMain));if(changed(mainTop,nextMainTop))effects.push(setSplitTopPadding.of(nextMainTop));if(changed(currentBlock,nextBlock))effects.push(setSplitBlockPadding.of(nextBlock));if(effects.length)main.dispatch({effects});
    if(rowStylesChanged){main.requestMeasure();schedule();}
    window.requestAnimationFrame(()=>{
      if(disposed)return;correctScroll();
      if(revealTarget===null)return;
      // A table row can gain height after its source scroll request was processed.
      // Replay the source request only after the measured row padding settles.
      revealFrames++;
      if(sourceEffects.length||effects.length||rowStylesChanged)revealStable=0;else revealStable++;
      if(revealStable>0){const pos=Math.min(revealTarget,source.state.doc.length);source.update([source.state.update({effects:EditorView.scrollIntoView(pos,{y:'nearest'})})]);}
      if(revealStable>=3||revealFrames>=24)revealTarget=null;else schedule();
    });
  }
  schedule();
  return {schedule,reveal(pos:number){revealTarget=Math.max(0,pos);revealFrames=0;revealStable=0;schedule();},dispose(){disposed=true;if(frame)window.cancelAnimationFrame(frame);if(releaseTimer)window.clearTimeout(releaseTimer);jobs.clear();observer.disconnect();main.dom.querySelectorAll<HTMLElement>('tr[style*="--split-table-extra"]').forEach(row=>row.style.removeProperty('--split-table-extra'));window.removeEventListener('resize',layout);for(const view of [source,main]){view.dom.removeEventListener('compositionstart',start,true);view.dom.removeEventListener('compositionend',end,true);view.dom.removeEventListener('load',layout,true);view.scrollDOM.removeEventListener('scroll',layout);view.scrollDOM.removeEventListener('wheel',cancelReveal);view.dom.removeEventListener('pointerdown',cancelReveal,true);}}};
}
