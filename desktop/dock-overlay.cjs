const { ipcRenderer } = require('electron');
const svgNamespace = 'http://www.w3.org/2000/svg';
let current = null;
let icons = {};

// Only the main process supplies glyphs after rebuilding the registered dock subset.
function drawIcon(glyph, size) {
  const svg = document.createElementNS(svgNamespace, 'svg');
  for (const [key, value] of Object.entries(glyph.attrs)) svg.setAttribute(key, value);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('data-hive-icon', glyph.name);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  for (const {tag, attrs} of glyph.shapes) {
    const shape = document.createElementNS(svgNamespace, tag);
    for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}

function draw() {
  const root = document.getElementById('root'); if (!root) return;
  root.replaceChildren();document.documentElement.style.cssText='';if (!current) return;
  for(const [key,color] of Object.entries(current.colors||{}))if(/^[a-zA-Z]{1,40}$/.test(key)&&/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color))document.documentElement.style.setProperty('--hive-dock-'+key.replace(/[A-Z]/g,value=>'-'+value.toLowerCase()),color);
  for (const tone of ['accent', 'danger']) {
    const color = current.iconColors?.[tone];
    if (typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) document.documentElement.style.setProperty(`--icon-${tone}`, color);
  }
  function box(rect, name) {
    const element = document.createElement('div'); element.className = name;
    for (const [key, value] of Object.entries({left:rect.x-(current.offset?.x||0),top:rect.y-(current.offset?.y||0),width:rect.width,height:rect.height})) element.style[key] = `${value}px`;
    root.appendChild(element); return element;
  }
  if (current.ready?.preview) box(current.ready.preview, 'dock-placement-preview');
  if (current.rail) box(current.rail.rect, 'dock-native-rail-preview');
  for (const guide of current.guides) {
    const edge=guide.key.split(':').at(-1),center=edge==='center',scope=guide.key.startsWith('workspace:')?'outer-guide':'inner-guide';
    const element=box(guide.button,`dock-guide ${scope}${center?' stack-guide':''}`);
    element.dataset.dockEdge=edge;
    element.setAttribute('role', 'img'); element.setAttribute('aria-label', guide.label);
    if (current.ready?.button && ['x','y','width','height'].every(key => current.ready.button[key] === guide.button[key])) element.classList.add('ready');
    const glyph=Object.hasOwn(icons,edge)?icons[edge]:icons.center;
    if (glyph) element.append(drawIcon(glyph,center?16:19));
  }
}
ipcRenderer.on('hive:dock-overlay-data', (_event, {icons:glyphs,...data}) => {
  if (glyphs) icons=glyphs;
  current=data;
  draw();
});
window.addEventListener('DOMContentLoaded', draw, {once:true});
