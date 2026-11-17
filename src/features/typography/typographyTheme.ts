import {EditorView} from '@codemirror/view';
// Each level has a distinct size. Keeping these values shared makes source/live hierarchy agree.
export const headingTypography=[
  {fontSize:'1.7em',fontWeight:'650',color:'#f1ede2'},
  {fontSize:'1.45em',fontWeight:'600',color:'#e6dfd0'},
  {fontSize:'1.25em',fontWeight:'600',color:'#d7d0bd'},
  {fontSize:'1.15em',fontWeight:'600',color:'#d1c9b6'},
  {fontSize:'1.07em',fontWeight:'600',color:'#c9c2b0'},
  {fontSize:'1em',fontWeight:'650',color:'#bdb8a8'},
] as const;
const headingRules:Record<string,Record<string,string>>={};
headingTypography.forEach((style,index)=>{
  headingRules[`.cm-markdown-h${index+1}`]={color:style.color,fontWeight:style.fontWeight};
  headingRules[`&[data-display-mode=source] .cm-markdown-h${index+1}`]={fontSize:style.fontSize};
  headingRules[`&[data-display-mode=live] .cm-line.cm-preview-h${index+1}`]={...style,lineHeight:'1.65',paddingTop:index<2?'8px':'4px',paddingBottom:index<2?'8px':'4px'};
});
export const typographyTheme=EditorView.theme({
  '.cm-scroller':{lineHeight:'var(--hive-line-height, 2.05)'},
  '.cm-content':{maxWidth:'var(--hive-max-width, 780px)',width:'100%',boxSizing:'border-box',minWidth:'0',lineBreak:'strict',wordBreak:'normal',overflowWrap:'anywhere',textWrap:'wrap'},
  // Percentage gutters adapt to each split pane, independent of the main window size.
  '.cm-line':{paddingLeft:'clamp(12px, 6.4%, 50px) !important',paddingRight:'clamp(12px, 6.4%, 50px) !important'},
  '&[data-display-mode=live] .cm-line.cm-typography-paragraph-end':{paddingBottom:'calc(2px + var(--hive-paragraph-spacing, 0em))'},
  '&[data-display-mode=live] .cm-line.cm-typography-indentable':{textIndent:'var(--hive-first-indent, 0em)'},
  '&[data-display-mode=live] .cm-preview-aligned[style*="center"], &[data-display-mode=live] .cm-preview-aligned[style*="right"]':{textIndent:'0'},
  '.cm-preview-code-line':{textIndent:'0',lineBreak:'auto'},
  ...headingRules,
});
