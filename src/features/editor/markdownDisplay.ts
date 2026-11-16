import {EditorState,StateEffect,StateField,type Extension} from '@codemirror/state';
import {Decoration,EditorView,WidgetType,type DecorationSet} from '@codemirror/view';
import {previewPlan,visibleReplacements,type PreviewReplacement} from './markdownPresentation';
import {localImageUrl,type ImageContext} from './insertions';
import {TableWidget,type TableMark} from './tableWidget';
import {annotationHighlights,setAnnotationMarks} from '../annotations/annotationDecorations';

export type DisplayMode='live'|'source';
export const setDisplayMode=StateEffect.define<DisplayMode>(),setPreviewFocus=StateEffect.define<boolean>();
export const displayModeField=StateField.define<DisplayMode>({create:()=> 'live',update(value,tr){for(const effect of tr.effects)if(effect.is(setDisplayMode))value=effect.value;return value;},provide:field=>EditorView.editorAttributes.from(field,value=>({'data-display-mode':value}))});
const previewFocus=StateField.define<boolean>({create:()=>false,update(value,tr){for(const effect of tr.effects)if(effect.is(setPreviewFocus))value=effect.value;return value;}});
const setImageContext=StateEffect.define<ImageContext|null>(),imageContext=StateField.define<ImageContext|null>({create:()=>null,update(value,tr){for(const effect of tr.effects)if(effect.is(setImageContext))value=effect.value;return value;}});

class PreviewWidget extends WidgetType{
  constructor(readonly item:PreviewReplacement,readonly context:ImageContext|null){super();}
  eq(other:PreviewWidget){return JSON.stringify(this.item)===JSON.stringify(other.item)&&JSON.stringify(this.context)===JSON.stringify(other.context);}
  toDOM(view:EditorView){
    const item=this.item;
    const edit=(element:HTMLElement,from=item.from)=>element.addEventListener('mousedown',event=>{event.preventDefault();event.stopPropagation();view.dispatch({selection:{anchor:from},userEvent:'select.pointer'});view.focus();});
    if(item.kind==='properties'){const block=document.createElement('div');block.className='cm-preview-properties';block.textContent='笔记属性';block.title='点击编辑属性源码';edit(block);return block;}
    if(item.kind==='rule'){const hr=document.createElement('hr');hr.className='cm-preview-rule';edit(hr);return hr;}
    const span=document.createElement('span');span.className='cm-preview-'+item.kind;
    span.textContent=item.kind==='image'?'▧ '+item.text:item.text||'';
    if(item.kind==='image'){
      span.title='图片：'+item.text+' · 点击编辑 Markdown';edit(span);
      const url=localImageUrl(item.src||'',this.context);
      if(url){const img=document.createElement('img');img.alt=item.text||'图片';img.loading='lazy';img.decoding='async';img.src=url;
        img.addEventListener('load',()=>view.requestMeasure());img.addEventListener('error',()=>{img.remove();span.textContent='▧ '+item.text;span.title='无法读取本地图片：'+item.text;view.requestMeasure();});span.textContent='';span.append(img);
      }
    }
    return span;
  }
  ignoreEvent(){return false;}
}
export const markdownPreview=StateField.define<DecorationSet>({
  create:build,
  update(value,tr){return tr.docChanged||tr.selection||tr.effects.some(effect=>effect.is(setDisplayMode)||effect.is(setPreviewFocus)||effect.is(setImageContext)||effect.is(setAnnotationMarks))?build(tr.state):value;},
  provide:field=>EditorView.decorations.from(field),
});
function build(state:EditorState){
  if(state.field(displayModeField,false)==='source')return Decoration.none;
  const ranges=[];
  for(const style of previewPlan(state).styles){
    const attributes:Record<string,string>={};if(style.align)attributes.style=`text-align: ${style.align}`;if(style.title)attributes.title=style.title;
    if(style.line)ranges.push(Decoration.line({class:style.className,attributes}).range(style.from));
    else if(style.to>style.from)ranges.push(Decoration.mark({class:style.className,attributes}).range(style.from,style.to));
  }
  const marks:TableMark[]=[];state.field(annotationHighlights,false)?.between(0,state.doc.length,(from,to,decoration)=>{const id=decoration.spec.attributes?.['data-annotation-id'];if(id)marks.push({from,to,id,note:decoration.spec.attributes?.['aria-label']||'文本标注'});});
  for(const item of visibleReplacements(state,state.field(previewFocus,false)===true))ranges.push(Decoration.replace({block:item.block,widget:item.kind==='table'?new TableWidget(item,state.field(imageContext,false)||null,marks.filter(mark=>mark.from<item.to&&mark.to>item.from)):item.kind?new PreviewWidget(item,state.field(imageContext,false)||null):undefined}).range(item.from,item.to));
  return Decoration.set(ranges,true);
}
export const markdownDisplayTheme=EditorView.baseTheme({
  '.cm-format-underline':{textDecoration:'underline',textUnderlineOffset:'3px'},
  '.cm-preview-strong':{fontWeight:'700'},'.cm-preview-emphasis':{fontStyle:'italic'},'.cm-preview-strike':{textDecoration:'line-through'},
  '.cm-preview-h1':{fontSize:'1.7em',fontWeight:'650',lineHeight:'1.65',paddingTop:'8px',paddingBottom:'8px'},
  '.cm-preview-h2':{fontSize:'1.25em',fontWeight:'600',lineHeight:'1.8',paddingTop:'6px',paddingBottom:'6px'},
  '.cm-preview-h3':{fontSize:'1.1em',fontWeight:'600'},'.cm-preview-h4,.cm-preview-h5,.cm-preview-h6':{fontWeight:'600'},
  '.cm-preview-code-line':{fontFamily:'Consolas, monospace',backgroundColor:'#ffffff06',lineHeight:'1.65'},
  '.cm-preview-inline-code':{fontFamily:'Consolas, monospace',backgroundColor:'#ffffff0b',borderRadius:'3px',padding:'1px 3px'},
  '.cm-preview-quote':{borderLeft:'2px solid #87926b',color:'#a5af99'},
  '.cm-preview-link':{color:'#d3bd80',textDecoration:'underline',textUnderlineOffset:'3px'},
  '.cm-preview-bullet':{color:'#b9c49e'},'.cm-preview-task':{color:'#c8ba7e',fontSize:'1.1em'},
  '.cm-preview-image':{display:'inline-block',maxWidth:'100%',boxSizing:'border-box',padding:'5px 12px',border:'1px solid #46513a',borderRadius:'4px',color:'#b9c49e'},
  '.cm-preview-image img':{display:'block',maxWidth:'100%',maxHeight:'360px',objectFit:'contain'},
  '.cm-preview-properties':{fontSize:'.8em',color:'#9daa88',padding:'5px 12px',marginBottom:'8px',borderBottom:'1px solid #46513a',cursor:'text'},
  '.cm-preview-rule':{border:'0',borderTop:'1px solid #526043',margin:'14px 50px'},
  '.cm-table-widget':{overflowX:'auto'},
  '.cm-table-marked':{backgroundColor:'#c9ae4030'},
  '.cm-table-select-top':{borderTop:'2px solid #e5cf72 !important'},
  '.cm-table-select-bottom':{borderBottom:'2px solid #e5cf72 !important'},
  '.cm-table-select-left':{borderLeft:'2px solid #e5cf72 !important'},
  '.cm-table-select-right':{borderRight:'2px solid #e5cf72 !important'},
  '.cm-table-widget button':{border:'0',background:'transparent',color:'#a5af99',cursor:'pointer'},
  '.cm-table-widget textarea':{display:'block',boxSizing:'border-box',width:'100%',minWidth:'40px',minHeight:'24px',height:'100%',resize:'none',border:'0',outline:'0',background:'transparent',color:'inherit',font:'inherit',overflow:'hidden'},
  '.cm-table-widget th,.cm-table-widget td':{position:'relative'},
  '.cm-table-resize-col':{position:'absolute',right:'-4px',top:'0',height:'100%',width:'8px',cursor:'col-resize',zIndex:'2'},
  '.cm-table-resize-row':{position:'absolute',bottom:'-4px',left:'0',width:'100%',height:'8px',cursor:'row-resize',zIndex:'2'},
  '.cm-preview-table':{borderCollapse:'collapse',margin:'12px 50px',maxWidth:'calc(100% - 100px)',fontSize:'.95em'},
  '.cm-preview-table td,.cm-preview-table th':{border:'1px solid #46513a',padding:'6px 12px',textAlign:'left'},
  '.cm-preview-table th':{background:'#ffffff08',fontWeight:'600'},
});
export const markdownDisplayExtensions:Extension=[displayModeField,previewFocus,imageContext,markdownPreview,markdownDisplayTheme,EditorView.focusChangeEffect.of((_state,focused)=>setPreviewFocus.of(focused))];
export function configureImageContext(view:EditorView,context:ImageContext|null){
  if(view.state.field(imageContext,false)===undefined)view.dispatch({effects:StateEffect.appendConfig.of(imageContext)});
  const current=view.state.field(imageContext);if(current?.file!==context?.file||current?.workspace!==context?.workspace)view.dispatch({effects:setImageContext.of(context)});
}
export function configureMarkdownDisplay(view:EditorView,mode:DisplayMode){
  if(view.state.field(displayModeField,false)===undefined)view.dispatch({effects:StateEffect.appendConfig.of(markdownDisplayExtensions)});
  if(view.state.field(displayModeField)!==mode)view.dispatch({effects:setDisplayMode.of(mode)});
  if(view.state.field(previewFocus)!==view.hasFocus)view.dispatch({effects:setPreviewFocus.of(view.hasFocus)});
}
