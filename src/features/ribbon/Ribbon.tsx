import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./ribbon-display.css";
import {
  ListPlus, ChevronDown, ChevronUp, EyeOff, MoreVertical, Settings2,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Clipboard,
  Columns2,
  FileText,
  Image,
  Italic,
  LayoutPanelTop,
  Link2,
  List,
  ListOrdered,
  MessageSquare,
  Search,
  SpellCheck,
  Type,
  Underline,
  Undo2,Redo2,Quote,Code,Code2,Minus,SquareCheck,Strikethrough,Table2,
} from "lucide-react";
import type {Alignment,InlineFormat} from '../editor/formatting';
export type RibbonCommand=InlineFormat|Alignment|'bullet'|'numbered'|'quote'|'task'|'codeBlock'|'link'|'rule'|'find'|'image'|'table'|'properties'|'undo'|'redo'|0|1|2|3|4;
const commands:Partial<Record<string,RibbonCommand>>={'撤销':'undo','重做':'redo','加粗':'bold','倾斜':'italic','下划线':'underline','删除线':'strike','行内代码':'inlineCode','代码块':'codeBlock','链接':'link','分隔线':'rule','待办列表':'task','左对齐':'left','居中':'center','右对齐':'right','项目符号':'bullet','编号':'numbered','引用':'quote','查找替换':'find','查找':'find','插入图片':'image','插入表格':'table','插入笔记属性':'properties','文档属性':'properties'};
const shortcuts:Partial<Record<string,string>>={'加粗':'Ctrl+B','倾斜':'Ctrl+I','下划线':'Ctrl+U','左对齐':'Ctrl+Shift+L','居中':'Ctrl+Shift+E','右对齐':'Ctrl+Shift+R','撤销':'Ctrl+Z','重做':'Ctrl+Y','查找替换':'Ctrl+F'};

const content = {
  文件: [
    {
      name: "文档",
      items: [
        ["新建", FileText],
        ["打开", Clipboard],
        ["导出", Columns2],
      ],
    },
    {
      name: "信息",
      items: [
        ["文档属性", Type],
        ["最近使用", List],
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
        ["删除线", Strikethrough],
        ["行内代码", Code],
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
    {name:'结构',items:[['代码块',Code2],['链接',Link2],['分隔线',Minus],['待办列表',SquareCheck]]},
    {
      name: "编辑",
      items: [
        ["查找替换", Search],
      ],
    },
  ],
  插入: [
    {
      name: "内容",
      items: [
        ["插入图片", Image],
        ["插入表格", Table2],
        ["插入笔记属性", ListPlus],
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
        ["查找", Search],
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
export default function Ribbon({viewControls,visible,collapsed,onVisibilityChange,onCollapsedChange,onSettings,onCommand,editorReady}:{viewControls:ReactNode;visible:boolean;collapsed:boolean;onVisibilityChange:(value:boolean)=>void;onCollapsedChange:(value:boolean)=>void;onSettings:()=>void;onCommand:(command:RibbonCommand)=>void;editorReady:boolean}) {
  const [tab, setTab] = useState<keyof typeof content>("开始");
  const [menuOpen,setMenuOpen]=useState(false),[position,setPosition]=useState({x:0,y:0});
  const menuButton=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
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
              {group.items.map(([name, Icon]) => (
                <button
                  key={name}
                  type="button"
                  disabled={commands[name]===undefined||!editorReady}
                  aria-label={commands[name]===undefined?name+'（功能预留）':name}
                  title={name+(commands[name]===undefined?' · 功能预留':shortcuts[name]?' · '+shortcuts[name]:'')}
                  onMouseDown={event=>{if(commands[name]!==undefined)event.preventDefault();}}
                  onClick={()=>{const command=commands[name];if(command!==undefined)onCommand(command);}}
                >
                  <Icon size={16} />
                  <span>{name}</span>
                </button>
              ))}
            </div>
            <small>{group.name}</small>
          </div>
        ))}
      </div>
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
