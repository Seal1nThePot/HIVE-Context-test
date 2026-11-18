import {EditorState,StateEffect,StateField,Transaction,type Extension} from '@codemirror/state';
import {Decoration,EditorView,ViewPlugin,WidgetType,type DecorationSet} from '@codemirror/view';
import {previewPlan,visibleReplacements,imageSelectionSignature,localPreviewUpdate,type PreviewReplacement} from './markdownPresentation';
import {localImageUrl,type ImageContext} from './insertions';
import {TableWidget,tableSizeHistory,type TableMark} from './tableWidget';
import {annotationHighlights,setAnnotationMarks} from '../annotations/annotationDecorations';
import {markdownParseState} from './markdownParse';
import {tableSegments} from './tableViewport';
import {MathWidget} from './mathWidget';
import {frontmatterVisible,subscribeFrontmatterVisibility} from './frontmatterVisibility';
import {typographyUpdateQueue} from '../typography/typographyUpdateQueue';
import {isolateHistory} from '@codemirror/commands';
import {codeBlockViewport} from './codeBlockViewport';
import {MermaidWidget} from './mermaidWidget';

export type DisplayMode='live'|'source';
export const setDisplayMode=StateEffect.define<DisplayMode>(),setPreviewFocus=StateEffect.define<boolean>();
export const displayModeField=StateField.define<DisplayMode>({create:()=> 'live',update(value,tr){for(const effect of tr.effects)if(effect.is(setDisplayMode))value=effect.value;return value;},provide:field=>EditorView.editorAttributes.from(field,value=>({'data-display-mode':value}))});
const previewFocus=StateField.define<boolean>({create:()=>false,update(value,tr){for(const effect of tr.effects)if(effect.is(setPreviewFocus))value=effect.value;return value;}});
export const setFrontmatterVisibility=StateEffect.define<boolean>();
export const frontmatterVisibilityField=StateField.define<boolean>({create:()=>frontmatterVisible(),update(value,tr){for(const effect of tr.effects)if(effect.is(setFrontmatterVisibility))value=effect.value;return value;}});
const setImageContext=StateEffect.define<ImageContext|null>(),imageContext=StateField.define<ImageContext|null>({create:()=>null,update(value,tr){for(const effect of tr.effects)if(effect.is(setImageContext))value=effect.value;return value;}});

class PreviewWidget extends WidgetType{
  constructor(readonly item:PreviewReplacement,readonly context:ImageContext|null,readonly propertyText?:string){super();}
  eq(other:PreviewWidget){return (this.item===other.item||this.item.kind===other.item.kind&&this.item.from===other.item.from&&this.item.to===other.item.to&&this.item.text===other.item.text&&this.item.src===other.item.src)&&this.propertyText===other.propertyText&&this.context?.workspace===other.context?.workspace&&this.context?.file===other.context?.file;}
  toDOM(view:EditorView){
    const document=view.dom.ownerDocument;
    const item=this.item;
    const edit=(element:HTMLElement,from=item.from)=>element.addEventListener('mousedown',event=>{event.preventDefault();event.stopPropagation();view.dispatch({selection:{anchor:from},userEvent:'select.pointer'});view.focus();});
    if(item.kind==='properties'){const block=document.createElement('div');block.className='cm-preview-properties';block.textContent=this.propertyText||'';block.title='点击编辑属性源码';edit(block);return block;}
    if(item.kind==='rule'){const hr=document.createElement('hr');hr.className='cm-preview-rule';edit(hr);return hr;}
    if(item.kind==='task'){
      const button=document.createElement('button');button.type='button';button.className='cm-preview-task';
      const checked=item.text==='☑';button.textContent=checked?'☑':'☐';button.setAttribute('role','checkbox');button.setAttribute('aria-checked',String(checked));button.setAttribute('aria-label',checked?'取消完成待办':'完成待办');button.disabled=view.state.readOnly;
      button.addEventListener('mousedown',event=>{event.preventDefault();event.stopPropagation();});
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();if(view.state.readOnly)return;
        const marker=view.state.sliceDoc(item.from,item.to);if(!/^\[[ xX]\]$/.test(marker))return;
        view.dispatch({changes:{from:item.from+1,to:item.from+2,insert:marker[1]===' '?'x':' '},effects:view.scrollSnapshot(),annotations:isolateHistory.of('full'),userEvent:'input.task'});
      });
      return button;
    }
    const span=document.createElement('span');span.className='cm-preview-'+item.kind;
    span.textContent=item.kind==='image'?'▧ '+item.text:item.text||'';
    if(item.kind==='image'){
      span.title='图片：'+item.text+' · 点击编辑 Markdown';edit(span,item.from+1);
      const url=localImageUrl(item.src||'',this.context);
      if(url){const img=document.createElement('img');img.alt=item.text||'图片';img.decoding='async';img.src=url;
        img.addEventListener('load',()=>view.requestMeasure());img.addEventListener('error',()=>{img.remove();span.textContent='▧ '+item.text;span.title='无法读取本地图片：'+item.text;view.requestMeasure();});span.textContent='';span.append(img);
      }
    }
    return span;
  }
  ignoreEvent(){return false;}
}
export const markdownPreview=StateField.define<DecorationSet>({
  create:build,
  update(value,tr){
    if(tr.docChanged||tr.effects.some(effect=>effect.is(setDisplayMode)||effect.is(setPreviewFocus)||effect.is(setImageContext)||effect.is(setAnnotationMarks)||effect.is(setFrontmatterVisibility)))return build(tr.state);
    if(tr.selection&&tr.state.field(previewFocus,false)&&(activeLines(tr.startState)!==activeLines(tr.state)||imageSelectionSignature(tr.startState)!==imageSelectionSignature(tr.state)))return build(tr.state);
    return value;
  },
  provide:field=>EditorView.decorations.from(field),
});
function activeLines(state:EditorState){return state.selection.ranges.map(range=>{const end=range.to>range.from&&state.doc.lineAt(range.to).from===range.to?range.to-1:range.to;return `${state.doc.lineAt(range.from).from}:${state.doc.lineAt(end).to}`;}).join(',');}
class WideTableNotice extends WidgetType{
  eq(){return true;}
  toDOM(view:EditorView){const note=view.dom.ownerDocument.createElement('div');note.className='cm-table-source-notice';note.textContent='此表列数较多，以下直接编辑 Markdown 源码；所有内容与撤销记录均保留。';return note;}
}
function build(state:EditorState){
  if(state.field(displayModeField,false)==='source')return Decoration.none;
  const ranges=[];
  for(const style of previewPlan(state).styles){
    const attributes:Record<string,string>={};if(style.align)attributes.style=`text-align: ${style.align}`;if(style.title)attributes.title=style.title;
    if(style.line)ranges.push(Decoration.line({class:style.className,attributes}).range(style.from));
    else if(style.to>style.from)ranges.push(Decoration.mark({class:style.className,attributes}).range(style.from,style.to));
  }
  const marks:TableMark[]=[];state.field(annotationHighlights,false)?.between(0,state.doc.length,(from,to,decoration)=>{const id=decoration.spec.attributes?.['data-annotation-id'];if(id)marks.push({from,to,id,note:decoration.spec.attributes?.['aria-label']||'文本标注'});});
  const showProperties=state.field(frontmatterVisibilityField,false)!==false;
  const items=visibleReplacements(state,state.field(previewFocus,false)===true);
  if(!showProperties){const property=previewPlan(state).replacements.find(item=>item.kind==='properties');if(property&&!items.includes(property))items.push(property);}
  for(const item of items){
    if(item.kind==='properties'&&!showProperties){ranges.push(Decoration.replace({block:true,inclusiveEnd:false}).range(item.from,item.to));continue;}
    if(item.kind==='table'){
      const segments=tableSegments(item,state.doc);
      if(!segments.length){ranges.push(Decoration.widget({widget:new WideTableNotice(),block:true,side:-1}).range(item.from));continue;}
      for(const segment of segments)ranges.push(Decoration.replace({block:true,widget:new TableWidget(item,state.field(imageContext,false)||null,marks.filter(mark=>mark.from<segment.to&&mark.to>segment.from),segment.fromRow,segment.toRow)}).range(segment.from,segment.to));
    }else if(item.kind==='mermaid'){
      ranges.push(Decoration.replace({block:true,widget:new MermaidWidget(item)}).range(item.from,item.to));
    }else if(item.kind==='math'){
      const widget=new MathWidget(item,state.doc);
      if(item.text){
        ranges.push(Decoration.widget({widget,block:item.block,side:-1}).range(item.from));
        ranges.push(Decoration.mark({class:'cm-math-source'}).range(item.from,item.to));
      }else ranges.push(Decoration.replace({block:item.block,widget}).range(item.from,item.to));
    // A hidden source line may end exactly where the next line's decoration starts.
    // Keep that endpoint outside the block replacement so its heading/paragraph style survives.
    }else ranges.push(Decoration.replace({block:item.block,inclusiveEnd:false,widget:item.kind?new PreviewWidget(item,state.field(imageContext,false)||null,item.kind==='properties'?state.sliceDoc(item.from,item.to).trimEnd():undefined):undefined}).range(item.from,item.to));
  }
  return Decoration.set(ranges,true);
}
export const markdownDisplayTheme=EditorView.baseTheme({
  '.cm-format-underline':{textDecoration:'underline',textUnderlineOffset:'3px'},
  '.cm-preview-strong':{fontWeight:'700'},'.cm-preview-emphasis':{fontStyle:'italic'},'.cm-preview-strike':{textDecoration:'line-through'},
  '.cm-preview-code-line':{fontFamily:'Consolas, monospace',backgroundColor:'color-mix(in srgb, var(--hive-document-text) 3%, transparent)',lineHeight:'1.65'},
  '.cm-preview-inline-code':{fontFamily:'Consolas, monospace',backgroundColor:'color-mix(in srgb, var(--hive-document-text) 5%, transparent)',borderRadius:'3px',padding:'1px 3px'},
  '.cm-preview-quote':{backgroundImage:'linear-gradient(var(--hive-surface-border), var(--hive-surface-border))',backgroundSize:'2px 100%',backgroundRepeat:'no-repeat',backgroundPosition:'max(0px, calc(clamp(12px, 6.4%, 50px) - 10px)) 0',color:'var(--hive-document-text, var(--text))'},
  '.cm-preview-link':{color:'var(--hive-document-text, var(--text))',textDecoration:'underline',textUnderlineOffset:'3px'},
  '.cm-preview-bullet':{color:'var(--hive-document-text, var(--text))'},'.cm-preview-task':{color:'var(--hive-accent)',fontSize:'1.1em',fontFamily:'inherit',border:'0',padding:'0',background:'transparent',cursor:'pointer',lineHeight:'inherit'},'.cm-preview-task:disabled':{cursor:'default'},
  '.cm-preview-image':{display:'inline-block',maxWidth:'100%',boxSizing:'border-box',padding:'5px 12px',border:'1px solid var(--hive-surface-border)',borderRadius:'4px',color:'var(--hive-document-text, var(--text))'},
  '.cm-preview-image img':{display:'block',maxWidth:'100%',maxHeight:'360px',objectFit:'contain'},
  '.cm-preview-properties':{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:'.8em',color:'var(--hive-document-text, var(--text))',padding:'5px 12px',marginBottom:'8px',borderBottom:'1px solid var(--hive-surface-border)',cursor:'text'},
  '.cm-preview-rule':{border:'0',borderTop:'1px solid var(--hive-document-text, var(--text))',margin:'14px 50px'},
  '.cm-table-widget':{overflowX:'auto'},
  '.cm-table-source-notice':{padding:'5px 50px',color:'var(--hive-document-text, var(--text))',fontSize:'.85em'},
  '.cm-table-widget[data-table-segment] .cm-preview-table':{marginTop:'0',marginBottom:'0'},
  '.cm-table-marked':{backgroundColor:'color-mix(in srgb, var(--hive-accent) 19%, transparent)'},
  '.cm-table-select-top':{borderTop:'2px solid var(--hive-accent) !important'},
  '.cm-table-select-bottom':{borderBottom:'2px solid var(--hive-accent) !important'},
  '.cm-table-select-left':{borderLeft:'2px solid var(--hive-accent) !important'},
  '.cm-table-select-right':{borderRight:'2px solid var(--hive-accent) !important'},
  '.cm-table-widget button':{border:'0',background:'transparent',color:'var(--hive-document-text, var(--text))',cursor:'pointer'},
  '.cm-table-widget textarea':{display:'block',boxSizing:'border-box',width:'100%',minWidth:'40px',minHeight:'24px',height:'100%',resize:'none',border:'0',outline:'0',background:'transparent',color:'inherit',font:'inherit',overflow:'hidden'},
  '.cm-table-widget th,.cm-table-widget td':{position:'relative'},
  '.cm-table-resize-col':{position:'absolute',right:'-4px',top:'0',height:'100%',width:'8px',cursor:'col-resize',zIndex:'2'},
  '.cm-table-resize-row':{position:'absolute',bottom:'-4px',left:'0',width:'100%',height:'8px',cursor:'row-resize',zIndex:'2'},
  '.cm-preview-table':{borderCollapse:'collapse',margin:'12px 50px',maxWidth:'calc(100% - 100px)',fontSize:'.95em'},
  '.cm-preview-table td,.cm-preview-table th':{border:'1px solid color-mix(in srgb, var(--hive-document-text, var(--text)) 20%, transparent)',padding:'6px 12px',textAlign:'left'},
  '.cm-mermaid-widget':{margin:'12px clamp(12px, 6.4%, 50px)',maxWidth:'100%',overflow:'auto',position:'relative'},
  '.cm-mermaid-widget svg':{display:'block',maxWidth:'100%',height:'auto'},
  '.cm-mermaid-widget button':{display:'block',marginBottom:'6px',font:'inherit',fontSize:'.8em',color:'var(--hive-document-text, var(--text))',background:'transparent',border:'1px solid var(--hive-surface-border)',borderRadius:'4px',cursor:'pointer'},
  '.cm-mermaid-widget pre':{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:'.85em'},
  '.cm-preview-table th':{background:'color-mix(in srgb, var(--hive-document-text) 4%, transparent)',fontWeight:'600'},
});
const frontmatterVisibilityPlugin=ViewPlugin.define(view=>{
  let composing=false,timer:ReturnType<typeof setTimeout>|undefined;
  const queue=typographyUpdateQueue<boolean>({composing:()=>composing||view.composing,schedule:callback=>setTimeout(callback,0),cancel:id=>clearTimeout(id as ReturnType<typeof setTimeout>),apply:visible=>{if(view.state.field(frontmatterVisibilityField)===visible)return;view.dispatch({effects:[setFrontmatterVisibility.of(visible),view.scrollSnapshot()],annotations:Transaction.addToHistory.of(false)});}});
  queue.request(frontmatterVisible());
  const unsubscribe=subscribeFrontmatterVisibility(()=>queue.request(frontmatterVisible()));
  const start=()=>{composing=true;},end=()=>{composing=false;clearTimeout(timer);timer=setTimeout(()=>queue.released(),0);};
  view.dom.addEventListener('compositionstart',start,true);view.dom.addEventListener('compositionend',end,true);
  return {update(){queue.released();},destroy(){unsubscribe();queue.dispose();clearTimeout(timer);view.dom.removeEventListener('compositionstart',start,true);view.dom.removeEventListener('compositionend',end,true);}};
});
export const markdownDisplayExtensions:Extension=[displayModeField,frontmatterVisibilityField,frontmatterVisibilityPlugin,previewFocus,imageContext,markdownParseState,localPreviewUpdate,markdownPreview,markdownDisplayTheme,codeBlockViewport,tableSizeHistory,EditorView.focusChangeEffect.of((_state,focused)=>setPreviewFocus.of(focused))];
export function configureImageContext(view:EditorView,context:ImageContext|null){
  if(view.state.field(imageContext,false)===undefined)view.dispatch({effects:StateEffect.appendConfig.of(imageContext)});
  const current=view.state.field(imageContext);if(current?.file!==context?.file||current?.workspace!==context?.workspace)view.dispatch({effects:setImageContext.of(context)});
}
export function configureMarkdownDisplay(view:EditorView,mode:DisplayMode){
  if(view.state.field(displayModeField,false)===undefined)view.dispatch({effects:StateEffect.appendConfig.of(markdownDisplayExtensions)});
  if(view.state.field(displayModeField)!==mode)view.dispatch({effects:setDisplayMode.of(mode)});
  if(view.state.field(previewFocus)!==view.hasFocus)view.dispatch({effects:setPreviewFocus.of(view.hasFocus)});
}
