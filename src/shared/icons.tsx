import {createElement,useSyncExternalStore,type ReactElement,type SVGProps} from 'react';
import icons from '../../shared/icons.json' with {type:'json'};
import {
  dockIconNames,iconAttributes,normalizeIconOverrides,svgNamespace,
  type DockIconOverrides,type IconDefinition,type IconOverrides,
} from '../../shared/iconPack.mjs';

export type IconName = keyof typeof icons;
type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref' | 'name'> & {size?: string | number};
export const iconNames = Object.keys(icons) as IconName[];
export const iconDefinitions: Record<IconName, IconDefinition> = icons;
const reactAttribute: Record<string,string> = {
  'stroke-width':'strokeWidth','stroke-linecap':'strokeLinecap','stroke-linejoin':'strokeLinejoin',
  'fill-rule':'fillRule','clip-rule':'clipRule',
};
const reactAttributes = (attributes: Record<string,string|undefined>) => Object.fromEntries(
  Object.entries(attributes).map(([name,value])=>[reactAttribute[name]??name,value]),
);

let overrides: IconOverrides = {};
const listeners=new Set<()=>void>();
type DomIcon = {name:IconName;element:WeakRef<SVGSVGElement>};
const domIcons=new Set<DomIcon>();
const cleanupDomIcon=new FinalizationRegistry<DomIcon>(entry=>domIcons.delete(entry));
const currentIcon=(name:IconName)=>overrides[name]??iconDefinitions[name];

export function subscribeIconOverrides(listener:()=>void) {
  listeners.add(listener);
  return ()=>{listeners.delete(listener);};
}

export function getDockIconOverrides():DockIconOverrides {
  return Object.fromEntries(Object.values(dockIconNames)
    .filter(name=>Object.hasOwn(overrides,name)).map(name=>[name,overrides[name]]));
}

export function setIconOverrides(value:IconOverrides|null|undefined) {
  const next=normalizeIconOverrides(value);
  const changed=new Set<IconName>();
  for(const name of iconNames){
    if(!Object.hasOwn(overrides,name)&&!Object.hasOwn(next,name))continue;
    if(JSON.stringify(overrides[name])===JSON.stringify(next[name])){
      if(next[name])next[name]=overrides[name];
    }else changed.add(name);
  }
  if(!changed.size)return;
  overrides=next;
  for(const entry of domIcons){
    const element=entry.element.deref();
    if(!element)domIcons.delete(entry);
    else if(changed.has(entry.name))drawDomIcon(element,currentIcon(entry.name));
  }
  listeners.forEach(listener=>listener());
}

export function Icon({name,size=24,className,width=size,height=size,...props}: IconProps & {name:IconName}) {
  const icon=useSyncExternalStore(subscribeIconOverrides,()=>currentIcon(name),()=>iconDefinitions[name]);
  return <svg aria-hidden="true" focusable="false" {...reactAttributes(iconAttributes(icon))} {...props} className={className} data-hive-icon={name} width={width} height={height}>
    {icon.shapes.map(({tag,attrs},index)=>createElement(tag,{
      key:index,...reactAttributes(attrs),
    }))}
  </svg>;
}

function drawDomIcon(element:SVGSVGElement,icon:IconDefinition) {
  const attributes=iconAttributes(icon);
  for(const key of ['fill-rule','clip-rule'])if(!Object.hasOwn(attributes,key))element.removeAttribute(key);
  for(const [key,value] of Object.entries(attributes))element.setAttribute(key,value);
  const nodes=icon.shapes.map(({tag,attrs})=>{
    const node=element.ownerDocument.createElementNS(svgNamespace,tag);
    for(const [key,value] of Object.entries(attrs)) {
      if (value !== undefined) node.setAttribute(key,value);
    }
    return node;
  });
  element.replaceChildren(...nodes);
}

export function createUiIcon(document:Document,name:IconName,size=16) {
  const element=document.createElementNS(svgNamespace,'svg');
  element.setAttribute('data-hive-icon',name);
  element.setAttribute('aria-hidden','true');
  element.setAttribute('focusable','false');
  element.setAttribute('width',String(size));
  element.setAttribute('height',String(size));
  drawDomIcon(element,currentIcon(name));
  // CodeMirror can retain a detached icon or move it into another window.
  // Keep live nodes current without extending their lifetime.
  const entry={name,element:new WeakRef(element)};
  domIcons.add(entry);
  cleanupDomIcon.register(element,entry);
  return element;
}

type IconComponent = ((props:IconProps)=>ReactElement)&{displayName:string};
const components=new Map<IconName,IconComponent>();
export function iconComponent(name:IconName):IconComponent {
  const existing=components.get(name);
  if(existing)return existing;
  const Component=Object.assign((props:IconProps)=><Icon {...props} name={name}/>,{displayName:name});
  components.set(name,Component);
  return Component;
}

const glyph=iconComponent;

export const AiLauncher = glyph("AiLauncher");
export const AlertCircle = glyph("AlertCircle");
export const AlignCenter = glyph("AlignCenter");
export const AlignLeft = glyph("AlignLeft");
export const AlignRight = glyph("AlignRight");
export const Archive = glyph("Archive");
export const ArrowDown = glyph("ArrowDown");
export const ArrowDownAZ = glyph("ArrowDownAZ");
export const ArrowDownWideNarrow = glyph("ArrowDownWideNarrow");
export const ArrowLeft = glyph("ArrowLeft");
export const ArrowRight = glyph("ArrowRight");
export const ArrowUp = glyph("ArrowUp");
export const ArrowUpNarrowWide = glyph("ArrowUpNarrowWide");
export const Bold = glyph("Bold");
export const BookMarked = glyph("BookMarked");
export const BookOpen = glyph("BookOpen");
export const Bot = glyph("Bot");
export const Camera = glyph("Camera");
export const Check = glyph("Check");
export const CheckCheck = glyph("CheckCheck");
export const ChevronDown = glyph("ChevronDown");
export const ChevronRight = glyph("ChevronRight");
export const ChevronsDown = glyph("ChevronsDown");
export const ChevronsDownUp = glyph("ChevronsDownUp");
export const ChevronsLeft = glyph("ChevronsLeft");
export const ChevronsRight = glyph("ChevronsRight");
export const ChevronsUp = glyph("ChevronsUp");
export const ChevronsUpDown = glyph("ChevronsUpDown");
export const ChevronUp = glyph("ChevronUp");
export const CircleHelp = glyph("CircleHelp");
export const Clipboard = glyph("Clipboard");
export const ClipboardList = glyph("ClipboardList");
export const ClipboardPaste = glyph("ClipboardPaste");
export const Code = glyph("Code");
export const Code2 = glyph("Code2");
export const Columns2 = glyph("Columns2");
export const ContentsPanel = glyph("ContentsPanel");
export const Copy = glyph("Copy");
export const Cpu = glyph("Cpu");
export const DocumentsPanel = glyph("DocumentsPanel");
export const Download = glyph("Download");
export const Eraser = glyph("Eraser");
export const Eye = glyph("Eye");
export const EyeOff = glyph("EyeOff");
export const FileCog = glyph("FileCog");
export const FileImage = glyph("FileImage");
export const FileInput = glyph("FileInput");
export const FileOutput = glyph("FileOutput");
export const FilePlus = glyph("FilePlus");
export const FilePlus2 = glyph("FilePlus2");
export const FileText = glyph("FileText");
export const Focus = glyph("Focus");
export const Folder = glyph("Folder");
export const FolderOpen = glyph("FolderOpen");
export const FolderPlus = glyph("FolderPlus");
export const FolderTree = glyph("FolderTree");
export const GripVertical = glyph("GripVertical");
export const Highlighter = glyph("Highlighter");
export const History = glyph("History");
export const Image = glyph("Image");
export const Info = glyph("Info");
export const Italic = glyph("Italic");
export const Keyboard = glyph("Keyboard");
export const Layers = glyph("Layers");
export const LayoutPanelTop = glyph("LayoutPanelTop");
export const Link2 = glyph("Link2");
export const List = glyph("List");
export const ListOrdered = glyph("ListOrdered");
export const ListPlus = glyph("ListPlus");
export const ListTree = glyph("ListTree");
export const LocateFixed = glyph("LocateFixed");
export const Lock = glyph("Lock");
export const LockOpen = glyph("LockOpen");
export const Maximize2 = glyph("Maximize2");
export const Menu = glyph("Menu");
export const MessageSquare = glyph("MessageSquare");
export const Minus = glyph("Minus");
export const MoreHorizontal = glyph("MoreHorizontal");
export const MoreVertical = glyph("MoreVertical");
export const Move = glyph("Move");
export const NotepadText = glyph("NotepadText");
export const NoteProperties = glyph("NoteProperties");
export const OutlinesPanel = glyph("OutlinesPanel");
export const Palette = glyph("Palette");
export const PanelLeftOpen = glyph("PanelLeftOpen");
export const PanelsTopLeft = glyph("PanelsTopLeft");
export const PanelTopClose = glyph("PanelTopClose");
export const Pencil = glyph("Pencil");
export const PencilLine = glyph("PencilLine");
export const Plug = glyph("Plug");
export const Plus = glyph("Plus");
export const Quote = glyph("Quote");
export const Redo2 = glyph("Redo2");
export const References = glyph("References");
export const RefreshCw = glyph("RefreshCw");
export const RotateCcw = glyph("RotateCcw");
export const Save = glyph("Save");
export const Scissors = glyph("Scissors");
export const ScratchPanel = glyph("ScratchPanel");
export const Search = glyph("Search");
export const Send = glyph("Send");
export const Server = glyph("Server");
export const Settings = glyph("Settings");
export const Settings2 = glyph("Settings2");
export const SlidersHorizontal = glyph("SlidersHorizontal");
export const Sparkles = glyph("Sparkles");
export const SpellCheck = glyph("SpellCheck");
export const Square = glyph("Square");
export const SquareCheck = glyph("SquareCheck");
export const SquarePen = glyph("SquarePen");
export const Strikethrough = glyph("Strikethrough");
export const Table2 = glyph("Table2");
export const TextSelect = glyph("TextSelect");
export const Trash2 = glyph("Trash2");
export const Type = glyph("Type");
export const Underline = glyph("Underline");
export const Undo2 = glyph("Undo2");
export const Upload = glyph("Upload");
export const WandSparkles = glyph("WandSparkles");
export const X = glyph("X");
