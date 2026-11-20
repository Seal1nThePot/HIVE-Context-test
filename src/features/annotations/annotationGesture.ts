export const previewAnnotationHint='实时预览为只读。请切换到实时编辑或左右分栏后创建标注。';

export function textAnnotationHit(
  event:Pick<MouseEvent,'button'|'ctrlKey'|'shiftKey'|'altKey'|'metaKey'>,
  position:number|null,
  ranges:readonly {from:number;to:number}[],
  link:string|undefined,
  annotationId:string|undefined,
){
  if(event.button!==0||!event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link||position===null)return false;
  return !!annotationId||ranges.some(range=>range.from<range.to&&position>=range.from&&position<=range.to);
}
