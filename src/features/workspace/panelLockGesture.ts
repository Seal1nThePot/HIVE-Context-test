export type PanelLockGesture='doubleClick'|'longPress';
export const PANEL_LOCK_HOLD_MS=600;
export const PANEL_LOCK_MOVE_PX=5;

/** Tracks only title-bar presses; content and controls are filtered by the caller. */
export class PanelLockGestureTracker {
  private pending:{id:string;x:number;y:number;pointerId:number}|null=null;
  private timer:ReturnType<typeof setTimeout>|null=null;
  constructor(private mode:PanelLockGesture,private toggle:(id:string)=>void){}
  start(id:string,x:number,y:number,pointerId:number){
    this.cancel();if(this.mode!=='longPress')return;
    this.pending={id,x,y,pointerId};
    this.timer=setTimeout(()=>{const pending=this.pending;this.pending=null;this.timer=null;if(pending)this.toggle(pending.id);},PANEL_LOCK_HOLD_MS);
  }
  move(x:number,y:number,pointerId:number){
    if(this.pending&&this.pending.pointerId===pointerId&&Math.hypot(x-this.pending.x,y-this.pending.y)>=PANEL_LOCK_MOVE_PX)this.cancel();
  }
  end(pointerId:number){if(this.pending?.pointerId===pointerId)this.cancel();}
  doubleClick(id:string){if(this.mode==='doubleClick'){this.cancel();this.toggle(id);return true;}return false;}
  cancel(){if(this.timer!==null)clearTimeout(this.timer);this.timer=null;this.pending=null;}
}
