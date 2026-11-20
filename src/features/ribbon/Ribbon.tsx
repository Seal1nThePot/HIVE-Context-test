import {useShortcutPreferences} from '../settings/ShortcutPreferences';
import {shortcutLabel,type ShortcutId} from '../settings/shortcuts';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./ribbon-display.css";
import {
  ChevronDown, ChevronUp, DocumentsPanel, EyeOff, iconComponent, MoreVertical, NoteProperties, Settings2,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Columns2,
  FileOutput,
  FileText,
  History,
  Image,
  Italic,
  LayoutPanelTop,
  Link2,
  List,
  ListOrdered,
  MessageSquare,
  SpellCheck,
  Type,
  Underline,
  Undo2,Redo2,Quote,Minus,SquareCheck,Strikethrough,Table2,
} from "../../shared/icons";
import type {Alignment,InlineFormat} from '../editor/formatting';
export type RibbonCommand=InlineFormat|Alignment|'bullet'|'numbered'|'quote'|'task'|'codeBlock'|'link'|'rule'|'details'|'find'|'image'|'table'|'properties'|'undo'|'redo'|0|1|2|3|4;
export type RibbonFileActions = Partial<Record<'new' | 'open' | 'export' | 'recent', { run: () => void; disabled?: boolean }>>;
const fileActionNames: Partial<Record<string, keyof RibbonFileActions>> = {
  新建: 'new',
  打开: 'open',
  导出: 'export',
  最近使用: 'recent',
};
const commands:Partial<Record<string,RibbonCommand>>={'撤销':'undo','重做':'redo','加粗':'bold','倾斜':'italic','下划线':'underline','切换高亮':'highlight','删除线':'strike','行内代码':'inlineCode','代码块':'codeBlock','链接':'link','分隔线':'rule','待办列表':'task','左对齐':'left','居中':'center','右对齐':'right','项目符号':'bullet','编号':'numbered','引用':'quote','查找替换':'find','查找':'find','插入图片':'image','插入表格':'table','折叠块':'details','插入笔记属性':'properties','文档属性':'properties'};
const shortcuts:Partial<Record<string,ShortcutId>>={'加粗':'bold','倾斜':'italic','下划线':'underline','左对齐':'alignLeft','居中':'alignCenter','右对齐':'alignRight','撤销':'undo','重做':'redo','查找替换':'find'};
const descriptions: Partial<Record<string,string>> = {
  '新建':'在当前仓库中新建 Markdown 文稿。',
  '打开':'打开文档面板以选择文件。',
  '导出':'将当前文稿导出为 Markdown 副本。',
  '最近使用':'查看当前仓库中最近打开的文件。',
  '撤销':'撤销上一步操作。','重做':'重做上一步撤销的操作。',
  '加粗':'将所选内容字体加粗。','倾斜':'将所选内容设为斜体。','下划线':'为所选内容添加下划线。','切换高亮':'添加或取消所选文字的高亮。','删除线':'为所选内容添加删除线。','行内代码':'将所选内容设为行内代码。',
  '左对齐':'将当前段落左对齐。','居中':'将当前段落居中对齐。','右对齐':'将当前段落右对齐。',
  '项目符号':'将当前内容设为项目符号列表。','编号':'将当前内容设为编号列表。','引用':'将当前内容设为引用。',
  '代码块':'插入或切换代码块。','链接':'为内容添加链接。','分隔线':'插入分隔线。','待办列表':'将当前内容设为待办列表。',
  '查找替换':'在当前文稿中查找和替换内容。','查找':'在当前文稿中查找内容。',
  '插入图片':'插入图片。','插入表格':'插入表格。','折叠块':'插入可展开和收起的折叠块。','插入笔记属性':'编辑文稿属性。','文档属性':'编辑文稿属性。',
};


const NewNoteIcon=iconComponent('file.newNote');
const HighlightIcon=iconComponent('format.highlight');
const InlineCodeIcon=iconComponent('format.inlineCode');
const CodeBlockIcon=iconComponent('insert.codeBlock');
const FindReplaceIcon=iconComponent('editor.findReplace');
const DetailsIcon=iconComponent('insert.details');

const content = {
  文件: [
    {
      name: "文档",
      items: [
        ["新建", NewNoteIcon],
        ["打开", DocumentsPanel],
        ["导出", FileOutput],
      ],
    },
    {
      name: "信息",
      items: [
        ["文档属性", NoteProperties],
        ["最近使用", History],
      ],
    },
  ],
  开始: [
    {
      name: "历史",
      items: [
        ["撤销", Undo2],
        ["重做", Redo2],
      ],
    },
    {
      name: "字体",
      items: [
        ["加粗", Bold],
        ["倾斜", Italic],
        ["下划线", Underline],
        ["切换高亮", HighlightIcon],
        ["删除线", Strikethrough],
        ["行内代码", InlineCodeIcon],
      ],
    },
    {
      name: "段落",
      items: [
        ["左对齐", AlignLeft],
        ["居中", AlignCenter],
        ["右对齐", AlignRight],
        ["项目符号", List],
        ["编号", ListOrdered],
        ["引用", Quote],
      ],
    },
    {name:'结构',items:[['代码块',CodeBlockIcon],['链接',Link2],['分隔线',Minus],['待办列表',SquareCheck]]},
    {
      name: "编辑",
      items: [
        ["查找替换", FindReplaceIcon],
      ],
    },
  ],
  插入: [
    {
      name: "内容",
      items: [
        ["插入图片", Image],
        ["插入表格", Table2],
        ["折叠块", DetailsIcon],
        ["插入笔记属性", NoteProperties],
        ["链接", Link2],
        ["文本", Type],
      ],
    },
    { name: "批注", items: [["新建批注", MessageSquare]] },
  ],
  审阅: [
    {
      name: "校对",
      items: [
        ["拼写检查", SpellCheck],
        ["查找", FindReplaceIcon],
      ],
    },
    { name: "批注", items: [["批注", MessageSquare]] },
  ],
  视图: [
    {
      name: "工作区",
      items: [
        ["导航窗格", Columns2],
        ["阅读视图", FileText],
        ["页面视图", LayoutPanelTop],
      ],
    },
  ],
} as const;
export default function Ribbon({viewControls,visible,collapsed,onVisibilityChange,onCollapsedChange,onSettings,onCommand,editorReady,fileActions}:{viewControls:ReactNode;visible:boolean;collapsed:boolean;onVisibilityChange:(value:boolean)=>void;onCollapsedChange:(value:boolean)=>void;onSettings:()=>void;onCommand:(command:RibbonCommand)=>void;editorReady:boolean;fileActions?:RibbonFileActions}) {
  const {bindings}=useShortcutPreferences();
  const [tab, setTab] = useState<keyof typeof content>("开始");
  const [menuOpen,setMenuOpen]=useState(false),[position,setPosition]=useState({x:0,y:0});
  const menuButton=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
  const [tooltip,setTooltip]=useState<{name:string; x:number; y:number; description:string}|null>(null);
  function showTooltip(name:string, target:HTMLElement, description:string) {
    const rect=target.getBoundingClientRect();
    const width=Math.min(260,window.innerWidth-16);
    setTooltip({name,x:Math.max(8,Math.min(rect.left,window.innerWidth-width-8)),y:rect.bottom+20,description});
  }
  useEffect(()=>{setTooltip(null);},[tab,visible,collapsed,editorReady]);
  useEffect(()=>{
    if(!tooltip)return;
    const dismiss=(event:KeyboardEvent)=>{if(event.key==='Escape')setTooltip(null);};
    const close=()=>setTooltip(null);
    document.addEventListener('keydown',dismiss);window.addEventListener('resize',close);window.addEventListener('scroll',close,true);
    return()=>{document.removeEventListener('keydown',dismiss);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);};
  },[tooltip]);
  useEffect(()=>{if(!visible)setMenuOpen(false);},[visible]);
  useLayoutEffect(()=>{
    if(!menuOpen||!menuButton.current)return;
    const rect=menuButton.current.getBoundingClientRect();
    setPosition({x:Math.max(8,Math.min(innerWidth-220,rect.right-212)),y:Math.max(8,Math.min(innerHeight-128,rect.bottom+3))});
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
  },[menuOpen]);
  useEffect(()=>{
    if(!menuOpen)return;
    const outside=(event:globalThis.PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!menuButton.current?.contains(event.target as Node))setMenuOpen(false);};
    const resize=()=>setMenuOpen(false);
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);};
  },[menuOpen]);
  function finish(action:()=>void){setMenuOpen(false);menuButton.current?.focus();action();}
  if(!visible)return null;
  return (
    <section className={"office-ribbon "+(collapsed?"ribbon-collapsed":"")} aria-label="顶部编辑栏">
      <div className="ribbon-tabs" role="tablist" aria-label="功能区选项卡">
        {Object.keys(content).map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={name === tab}
            onClick={() => {setTab(name as keyof typeof content);if(collapsed)onCollapsedChange(false);}}
          >
            {name}
          </button>
        ))}
        <span>{collapsed?'工具区已折叠':tab==="视图"?'保存的视图':''}</span>
        <button ref={menuButton} type="button" className="ribbon-options-button" aria-label="顶部编辑栏功能" title="编辑栏功能" aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setMenuOpen(true);}}}><MoreVertical size={15}/></button>
      </div>
      <div id="ribbon-tool-region" hidden={collapsed} className={"ribbon-body "+(tab==="视图"?"view-ribbon":tab==='开始'?'home-ribbon':'')}>
        {tab==="视图"?viewControls:content[tab].map((group) => (
          <div className="ribbon-group" data-ribbon-group={group.name} key={group.name}>
            <div className="ribbon-tools">
              {group.name === "字体" && (
                <select className="ribbon-heading-select" aria-label="段落样式" value="" disabled={!editorReady} onChange={event=>{onCommand(Number(event.target.value) as 0|1|2|3|4);}}>
                  <option value="" disabled>标题 / 正文</option><option value="0">正文</option><option value="1">标题 1</option><option value="2">标题 2</option><option value="3">标题 3</option><option value="4">标题 4</option>
                </select>
              )}
              {group.items.map(([name, Icon]) => {
                const fileActionName = fileActionNames[name];
                const fileAction = fileActionName ? fileActions?.[fileActionName] : undefined;
                const command = commands[name];
                const reserved = !fileAction && command === undefined;
                const disabled = fileAction ? !!fileAction.disabled : reserved || !editorReady;
                let unavailable = '';
                if (reserved) unavailable = '功能预留';
                else if (disabled) {
                  if (!fileAction) unavailable = '请先打开或激活编辑区';
                  else if (fileActionName === 'export' && !editorReady) unavailable = '请先打开或激活 Markdown 文稿';
                  else unavailable = '当前不可用';
                }
                const description = reserved ? '此功能尚未开放。' : unavailable ? unavailable + '。' : descriptions[name] || '执行此操作。';
                return <div key={name} className="ribbon-tool-trigger"
                  tabIndex={disabled?0:undefined}
                  aria-label={disabled?name+'（'+unavailable+'）':undefined}
                  aria-disabled={disabled||undefined}
                  aria-describedby={disabled&&tooltip?.name===name?'ribbon-tool-tooltip':undefined}
                  onMouseEnter={event=>showTooltip(name,event.currentTarget,description)}
                  onMouseLeave={()=>setTooltip(null)}
                  onFocus={event=>showTooltip(name,event.currentTarget,description)}
                  onBlur={()=>setTooltip(null)}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={reserved?name+'（功能预留）':name}
                    aria-describedby={!disabled&&tooltip?.name===name?'ribbon-tool-tooltip':undefined}
                    onMouseDown={event=>{if(command!==undefined)event.preventDefault();}}
                    onClick={()=>{if(fileAction)fileAction.run();else if(command!==undefined)onCommand(command);}}
                  >
                    <Icon size={16} />
                    <span>{name}</span>
                  </button>
                </div>;
              })}
            </div>
            <small>{group.name}</small>
          </div>
        ))}
      </div>
      {tooltip&&createPortal(<div id="ribbon-tool-tooltip" className="ribbon-tool-tooltip" role="tooltip" style={{left:tooltip.x,top:tooltip.y}}>
        <strong>{tooltip.name}{shortcuts[tooltip.name]?' ('+shortcutLabel(bindings,shortcuts[tooltip.name]!)+')':''}</strong>
        <span>{tooltip.description}</span>
      </div>,document.body)}
      {menuOpen&&createPortal(<div ref={menu} className="panel-control-menu ribbon-display-menu" role="menu" aria-label="顶部编辑栏操作" style={{left:position.x,top:position.y}} onKeyDown={event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(()=>{});}
        if(event.key==='Tab'){setMenuOpen(false);menuButton.current?.focus();}
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
          event.preventDefault();const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')),index=items.indexOf(document.activeElement as HTMLButtonElement);
          items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();
        }
      }}>
        <button type="button" role="menuitem" onClick={()=>finish(()=>onCollapsedChange(!collapsed))}>{collapsed?<ChevronDown size={14}/>:<ChevronUp size={14}/>}<span>{collapsed?'展开工具区':'折叠工具区'}</span></button>
        <button type="button" role="menuitem" onClick={()=>finish(()=>onVisibilityChange(false))}><EyeOff size={14}/><span>隐藏顶部编辑栏</span></button>
        <hr/><button type="button" role="menuitem" onClick={()=>finish(onSettings)}><Settings2 size={14}/><span>编辑栏设置</span></button>
      </div>,document.body)}
    </section>
  );
}
