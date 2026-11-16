export const RAIL_HOLD_MS=1000,RAIL_MOVE_PX=5;
export function normalizeRailHoldMs(value:number,fallback=RAIL_HOLD_MS){return Number.isFinite(value)&&value>=50&&value<=3000?value:fallback;}
export function effectiveRailHoldMs(holdMs:number,minimumMs:number){return Math.max(normalizeRailHoldMs(holdMs),normalizeRailHoldMs(minimumMs,200));}
type Press={pointerId:number;x:number;y:number;started:number;armed:boolean};
export class RailHoldGesture {
  private press:Press|null=null;
  private readonly holdMs:number;
  constructor(holdMs=RAIL_HOLD_MS,minimumMs=200){this.holdMs=effectiveRailHoldMs(holdMs,minimumMs);}
  start(pointerId:number,x:number,y:number,now:number){this.press={pointerId,x,y,started:now,armed:false};}
  arm(now:number){if(!this.press||now-this.press.started<this.holdMs)return false;this.press.armed=true;return true;}
  move(pointerId:number,x:number,y:number){if(!this.press||this.press.pointerId!==pointerId)return 'ignored' as const;if(!this.press.armed&&Math.hypot(x-this.press.x,y-this.press.y)>RAIL_MOVE_PX){this.press=null;return 'cancelled' as const;}return this.press.armed?'dragging' as const:'pending' as const;}
  end(pointerId:number){if(!this.press||this.press.pointerId!==pointerId)return false;const armed=this.press.armed;this.press=null;return armed;}
  cancel(){this.press=null;}
}
export function railDropOffset(x:number,y:number,rect:{left:number;top:number;right:number;bottom:number}):number|null{
  if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return null;
  return y<(rect.top+rect.bottom)/2?.25:.75;
}
export function railDragTarget(edge:'left'|'right',x:number,y:number,rect:{left:number;top:number;right:number;bottom:number},viewport:{width:number;height:number},scale:number):number|'dock'|null{
  if(x<0||y<0||x>viewport.width||y>viewport.height||y<rect.top||y>rect.bottom)return null;
  const inward=edge==='left'?x-rect.right:rect.left-x;
  if(inward>=64*scale)return 'dock';
  return y<(rect.top+rect.bottom)/2?.25:.75;
}

export type RailSide='left'|'right';
type RailRect={left:number;top:number;right:number;bottom:number};
export type RailTarget={kind:'rail';edge:RailSide;offset:number}|{kind:'dock'};
export function railCrossTarget(source:RailSide,x:number,y:number,rails:Record<RailSide,RailRect>,viewport:{width:number;height:number},scale:number):RailTarget|null{
  if(x<0||y<0||x>viewport.width||y>viewport.height)return null;
  for(const edge of ['left','right'] as const){const rect=rails[edge];if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom)return {kind:'rail',edge,offset:y<(rect.top+rect.bottom)/2?.25:.75};}
  const rect=rails[source];if(y<rect.top||y>rect.bottom)return null;const inward=source==='left'?x-rect.right:rect.left-x;if(inward>=64*scale)return {kind:'dock'};return {kind:'rail',edge:source,offset:y<(rect.top+rect.bottom)/2?.25:.75};
}
