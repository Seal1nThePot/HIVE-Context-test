import {Transaction, type EditorState} from '@codemirror/state';
import type {EditorView} from '@codemirror/view';
import type {DisplayMode} from './markdownDisplay';
import {isFoldingEffect} from './headingFolding';
import {virtualLineWindow} from './splitAlignment';
import {previewPlan} from './markdownPresentation';

export type EditorDisplayMode=DisplayMode|'split';
export function underlyingDisplayMode(mode:EditorDisplayMode):DisplayMode{return mode==='split'?'live':mode;}

/** Map the top visible document line and its relative offset, rather than raw pixels. */
export function synchronizeScroll(source:EditorView,live:EditorView){
  const expected=new WeakMap<EditorView,number>();let last:EditorView=live;
  const bind=(from:EditorView,to:EditorView)=>{
    let previousTop=from.scrollDOM.scrollTop;
    const handler=(event?:Event)=>{
      const top=from.scrollDOM.scrollTop, pending=expected.get(from);
      if(event&&Math.abs(top-previousTop)<.5)return;
      previousTop=top;
      if(pending!==undefined){expected.delete(from);if(Math.abs(pending-top)<2)return;}
      if(!from.scrollDOM.clientHeight||!to.scrollDOM.clientHeight)return;
      last=from;
      const virtual=source.state.field(virtualLineWindow,false);
      let next:number;
      if(virtual){
        const sourceTop=source.lineBlockAt(virtual.lineFrom).top,liveTop=live.lineBlockAt(virtual.lineFrom).top;
        next=Math.max(0,top+(from===source?liveTop-sourceTop:sourceTop-liveTop));
      }else{
        const block=from.lineBlockAtHeight(top), line=from.state.doc.lineAt(block.from);
        const target=to.lineBlockAt(Math.min(line.from,to.state.doc.length));
        if(block.to>line.to||target.from<line.from||target.to>line.to){
          // A generated block (notably a segmented table) covers several source
          // lines. Their visual offsets are aligned inside the block as well.
          const origin=from.lineBlockAt(target.from);
          next=Math.max(0,target.top+top-origin.top);
        }else{
          const fraction=block.height?Math.max(0,Math.min(1,(top-block.top)/block.height)):0;
          next=Math.max(0,target.top+fraction*target.height);
        }
      }
      if(Math.abs(to.scrollDOM.scrollTop-next)<2)return;
      expected.set(to,next);to.scrollDOM.scrollTop=next;
      expected.set(to,to.scrollDOM.scrollTop);
    };
    from.scrollDOM.addEventListener('scroll',handler,{passive:true});
    return {sync:handler,dispose:()=>from.scrollDOM.removeEventListener('scroll',handler)};
  };
  const a=bind(source,live),b=bind(live,source);
  const window=live.dom.ownerDocument.defaultView, frame=window?.requestAnimationFrame(()=>b.sync());
  const dispose=()=>{if(frame!==undefined)window?.cancelAnimationFrame(frame);a.dispose();b.dispose();};
  return Object.assign(dispose,{correct(){
    if(!source.state.doc.eq(live.state.doc))return;
    const sourceBounds=source.scrollDOM.getBoundingClientRect(),liveBounds=live.scrollDOM.getBoundingClientRect();
    // Table source characters are replaced by widgets, so they are absent from
    // live.visibleRanges. Use the actual rendered row instead of a block boundary.
    const tables=previewPlan(live.state).replacements.filter(item=>item.kind==='table');
    for(const root of live.dom.querySelectorAll<HTMLElement>('[data-table-widget]')){
      const table=tables.find(item=>item.tableOrdinal===Number(root.dataset.tableOrdinal));if(!table)continue;
      for(const row of root.querySelectorAll<HTMLElement>('tr[data-row]')){
        const cell=table.rows?.[Number(row.dataset.row)]?.[0];if(!cell)continue;
        const visual=[...row.querySelectorAll<HTMLElement>('.cm-table-cell-preview,textarea')].find(node=>node.getBoundingClientRect().height>0);if(!visual)continue;
        const right=visual.getBoundingClientRect(),left=source.coordsAtPos(source.state.doc.lineAt(cell.from).from);
        if(!left||right.bottom<liveBounds.top||right.top>liveBounds.bottom||left.bottom<sourceBounds.top||left.top>sourceBounds.bottom)continue;
        const delta=left.top-right.top;if(Math.abs(delta)<.75)return;
        const target=last===source?live:source,next=target.scrollDOM.scrollTop+(target===source?delta:-delta);
        expected.set(target,next);target.scrollDOM.scrollTop=next;expected.set(target,target.scrollDOM.scrollTop);return;
      }
    }
    for(const sr of source.visibleRanges)for(const lr of live.visibleRanges){
      const from=Math.max(sr.from,lr.from),to=Math.min(sr.to,lr.to,from+2000);
      for(let pos=from;pos<to;pos++){
        const left=source.coordsForChar(pos),right=live.coordsForChar(pos);if(!left||!right)continue;
        if(right.bottom<liveBounds.top||right.top>liveBounds.bottom||left.bottom<sourceBounds.top||left.top>sourceBounds.bottom)continue;
        const delta=left.top-right.top;if(Math.abs(delta)<.75)return;
        const target=last===source?live:source,next=target.scrollDOM.scrollTop+(target===source?delta:-delta);
        expected.set(target,next);target.scrollDOM.scrollTop=next;expected.set(target,target.scrollDOM.scrollTop);return;
      }
    }
  }});
}

/** Transfer source edits into the authoritative history; only source-facing selection is copied back. */
export function sourceTransaction(tr:Transaction){
  const userEvent=tr.annotation(Transaction.userEvent), addToHistory=tr.annotation(Transaction.addToHistory);
  return {changes:tr.changes,selection:tr.newSelection,effects:tr.effects.filter(isFoldingEffect),scrollIntoView:false,annotations:[...(userEvent?[Transaction.userEvent.of(userEvent)]:[]),...(addToHistory===false?[Transaction.addToHistory.of(false)]:[])]};
}
export function mirrorTransaction(state:EditorState,tr:Transaction){
  return state.update({changes:tr.changes,selection:tr.newSelection,effects:tr.effects.filter(isFoldingEffect),scrollIntoView:tr.scrollIntoView,annotations:Transaction.addToHistory.of(false)});
}
