const { ipcRenderer } = require('electron');
// Lucide 0.468.0 paths, matching the Arrow*/Layers components in DockGuides.
const iconPaths={left:['m12 19-7-7 7-7','M19 12H5'],right:['M5 12h14','m12 5 7 7-7 7'],top:['m5 12 7-7 7 7','M12 19V5'],bottom:['M12 5v14','m19 12-7 7-7-7'],center:['M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z','M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12','M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17']};
let current = null;
function draw() {
  const root = document.getElementById('root'); if (!root) return;
  root.replaceChildren();document.documentElement.style.cssText='';if (!current) return;
  for(const [key,color] of Object.entries(current.colors||{}))if(/^[a-zA-Z]{1,40}$/.test(key)&&/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color))document.documentElement.style.setProperty('--hive-dock-'+key.replace(/[A-Z]/g,value=>'-'+value.toLowerCase()),color);
  function box(rect, name) {
    const element = document.createElement('div'); element.className = name;
    for (const [key, value] of Object.entries({left:rect.x,top:rect.y,width:rect.width,height:rect.height})) element.style[key] = `${value}px`;
    root.appendChild(element); return element;
  }
  if (current.ready?.preview) box(current.ready.preview, 'dock-placement-preview');
  if (current.rail) box(current.rail.rect, 'dock-native-rail-preview');
  for (const guide of current.guides) {
    const edge=guide.key.split(':').at(-1),center=edge==='center',scope=guide.key.startsWith('workspace:')?'outer-guide':'inner-guide';
    const element=box(guide.button,`dock-guide ${scope}${center?' stack-guide':''}`), arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');
    element.dataset.dockEdge=edge;
    element.setAttribute('role', 'img'); element.setAttribute('aria-label', guide.label);
    if (current.ready?.button && ['x','y','width','height'].every(key => current.ready.button[key] === guide.button[key])) element.classList.add('ready');
    for(const [key,value] of Object.entries({width:center?16:19,height:center?16:19,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))arrow.setAttribute(key,String(value));
    for(const d of iconPaths[edge]||iconPaths.center){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);arrow.appendChild(path);}
    element.append(arrow);
  }
}
ipcRenderer.on('hive:dock-overlay-data', (_event, data) => { current=data; draw(); });
window.addEventListener('DOMContentLoaded', draw, {once:true});
