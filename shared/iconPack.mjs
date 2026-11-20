import builtins from './icons.json' with {type:'json'};

export const svgNamespace = 'http://www.w3.org/2000/svg';
const attributesByShape = {
  path: ['d'], circle: ['cx','cy','r'], ellipse: ['cx','cy','rx','ry'],
  rect: ['x','y','width','height','rx','ry'], line: ['x1','y1','x2','y2'],
  polyline: ['points'], polygon: ['points'],
};
const drawingAttributes = ['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','clip-rule'];
const requiredByShape = {path:['d'],circle:['r'],ellipse:['rx','ry'],rect:['width','height'],line:[],polyline:['points'],polygon:['points']};
const numeric = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i;
const pathCoordinate = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/iy;
const pathArity={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0};
const iconColor = /^var\(\s*(--icon-(?:accent|danger))\s*,\s*currentColor\s*\)$/;
const invalid = () => Object.assign(new Error('图标只接受带有效 viewBox 的纯矢量 SVG 图形。'),{status:400});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function drawingValue(name,value){
  if(name==='fill'||name==='stroke'){
    if(value==='none'||value==='currentColor')return value;
    const themedColor=iconColor.exec(value);
    if(themedColor)return `var(${themedColor[1]},currentColor)`;
    if(/^(?:#[\da-f]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([\d.% ,/+\-]+\))$/i.test(value))return value==='transparent'?'none':'currentColor';
  }else if(name==='stroke-linecap'&&['butt','round','square'].includes(value))return value;
  else if(name==='stroke-linejoin'&&['miter','round','bevel'].includes(value))return value;
  else if((name==='fill-rule'||name==='clip-rule')&&['nonzero','evenodd'].includes(value))return value;
  else if(name==='stroke-width'&&numeric.test(value)&&Number(value)>=0&&Number(value)<=100)return value;
  throw invalid();
}

function drawing(raw){
  return Object.fromEntries(drawingAttributes.filter(name=>Object.hasOwn(raw,name)).map(name=>{
    if(typeof raw[name]!=='string'||raw[name].length>80)throw invalid();
    return [name,drawingValue(name,raw[name])];
  }));
}

export function validIconName(name){return typeof name==='string'&&Object.hasOwn(builtins,name);}

function validPath(data){
  let index=0,command='',remaining=0,afterNumber=false;
  while(index<data.length){
    if(/\s/.test(data[index])){index++;continue;}
    if(data[index]===','){
      if(!afterNumber)return false;
      afterNumber=false;
      index++;
      while(index<data.length&&/\s/.test(data[index]))index++;
      if(!/[+\-.\d]/.test(data[index]??''))return false;
    }
    const marker=data[index].toUpperCase();
    if(Object.hasOwn(pathArity,marker)){
      if((!command&&marker!=='M')||remaining)return false;
      command=marker;
      remaining=pathArity[command];
      afterNumber=false;
      index++;
      continue;
    }
    if(!command||command==='Z')return false;
    if(!remaining)remaining=pathArity[command];
    if(command==='A'&&(remaining===4||remaining===3)){
      if(data[index]!=='0'&&data[index]!=='1')return false;
      index++;
    }else{
      pathCoordinate.lastIndex=index;
      const coordinate=pathCoordinate.exec(data)?.[0];
      if(!coordinate||!Number.isFinite(Number(coordinate)))return false;
      index=pathCoordinate.lastIndex;
    }
    remaining--;
    afterNumber=true;
  }
  return !!command&&remaining===0;
}

export function validateIconDefinition(raw){
  if(!object(raw)||typeof raw.viewBox!=='string'||raw.viewBox.length>80||!Array.isArray(raw.shapes)||raw.shapes.length<1||raw.shapes.length>64)throw invalid();
  const box=raw.viewBox.trim().split(/[\s,]+/);
  if(box.length!==4||box.some(value=>!numeric.test(value)||!Number.isFinite(Number(value))||Math.abs(Number(value))>100000)||Number(box[2])<=0||Number(box[3])<=0)throw invalid();
  const shapes=raw.shapes.map(shape=>{
    if(!object(shape)||typeof shape.tag!=='string'||!Object.hasOwn(attributesByShape,shape.tag)||!object(shape.attrs))throw invalid();
    const {tag}=shape,attrs={...drawing(shape.attrs)};
    const geometry=attributesByShape[tag];
    if(Object.keys(shape.attrs).some(key=>!drawingAttributes.includes(key)&&!geometry.includes(key)))throw invalid();
    for(const key of geometry){
      if(!Object.hasOwn(shape.attrs,key))continue;
      const value=shape.attrs[key];
      if(typeof value!=='string'||value.length>8192)throw invalid();
      if(key==='d'){
        if(!validPath(value))throw invalid();
      }else if(key==='points'){
        const points=value.trim().split(/[\s,]+/);
        if(points.length<4||points.length%2||points.some(item=>!numeric.test(item)||!Number.isFinite(Number(item))))throw invalid();
      }else if(!numeric.test(value)||!Number.isFinite(Number(value)))throw invalid();
      attrs[key]=value;
    }
    if(requiredByShape[tag].some(key=>!Object.hasOwn(attrs,key)))throw invalid();
    return {tag,attrs};
  });
  return {viewBox:box.join(' '),...drawing(raw),shapes};
}

export function validateIconPack(raw){
  if(!object(raw)||raw.version!==1||!object(raw.icons))throw invalid();
  return {version:1,icons:Object.fromEntries(Object.entries(raw.icons).map(([name,icon])=>{
    if(!validIconName(name))throw Object.assign(new Error(`未知图标：${name}`),{status:400});
    return [name,validateIconDefinition(icon)];
  }))};
}

export function normalizeIconOverrides(raw, names=Object.keys(builtins)){
  if(!object(raw))return {};
  const icons=[];
  for(const name of names){
    if(!validIconName(name)||!Object.hasOwn(raw,name))continue;
    try{icons.push([name,validateIconDefinition(raw[name])]);}
    catch{/* A malformed entry leaves the registered icon available. */}
  }
  return Object.fromEntries(icons);
}

export function iconAttributes(icon){
  return {viewBox:icon.viewBox??'0 0 24 24',fill:icon.fill??'none',stroke:icon.stroke??'currentColor',
    'stroke-width':icon['stroke-width']??'2','stroke-linecap':icon['stroke-linecap']??'round',
    'stroke-linejoin':icon['stroke-linejoin']??'round',...drawing(icon)};
}

export const dockIconNames=Object.freeze({left:'ArrowLeft',right:'ArrowRight',top:'ArrowUp',bottom:'ArrowDown',center:'Layers'});

export function dockIcons(raw){
  const overrides=normalizeIconOverrides(raw,Object.values(dockIconNames));
  return Object.fromEntries(Object.entries(dockIconNames).map(([edge,name])=>[edge,overrides[name]??builtins[name]]));
}

export function dockIconPayload(raw){
  const icons=dockIcons(raw);
  return Object.fromEntries(Object.entries(icons).map(([edge,icon])=>[edge,{
    name:dockIconNames[edge],attrs:iconAttributes(icon),shapes:icon.shapes,
  }]));
}
