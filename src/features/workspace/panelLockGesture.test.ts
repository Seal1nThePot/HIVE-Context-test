import {afterEach,describe,expect,it,vi} from 'vitest';
import {PanelLockGestureTracker,PANEL_LOCK_HOLD_MS} from './panelLockGesture';

afterEach(()=>vi.useRealTimers());
describe('title-bar position lock gestures',()=>{
  it('uses exactly the selected gesture',()=>{
    vi.useFakeTimers();const toggle=vi.fn(),double=new PanelLockGestureTracker('doubleClick',toggle);
    double.start('outline',20,30,1);vi.advanceTimersByTime(1000);expect(toggle).not.toHaveBeenCalled();
    expect(double.doubleClick('outline')).toBe(true);expect(toggle).toHaveBeenCalledWith('outline');
    const hold=new PanelLockGestureTracker('longPress',toggle);expect(hold.doubleClick('scratch')).toBe(false);expect(toggle).toHaveBeenCalledTimes(1);
  });
  it('locks once at the hold threshold and allows a second hold to unlock',()=>{
    vi.useFakeTimers();const toggle=vi.fn(),hold=new PanelLockGestureTracker('longPress',toggle);
    hold.start('scratch',20,30,1);vi.advanceTimersByTime(PANEL_LOCK_HOLD_MS-1);expect(toggle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);vi.advanceTimersByTime(2000);expect(toggle).toHaveBeenCalledTimes(1);
    hold.start('scratch',20,30,2);vi.advanceTimersByTime(PANEL_LOCK_HOLD_MS);expect(toggle).toHaveBeenCalledTimes(2);
  });
  it('cancels when a press becomes a drag, releases early, or is interrupted',()=>{
    vi.useFakeTimers();const toggle=vi.fn(),hold=new PanelLockGestureTracker('longPress',toggle);
    hold.start('files',10,10,1);hold.move(13,14,1);vi.advanceTimersByTime(1000);
    hold.start('files',10,10,2);hold.end(2);vi.advanceTimersByTime(1000);
    hold.start('files',10,10,3);hold.cancel();vi.advanceTimersByTime(1000);expect(toggle).not.toHaveBeenCalled();
  });
  it('ignores unrelated pointers and clears the old timer when a new press starts',()=>{
    vi.useFakeTimers();const toggle=vi.fn(),hold=new PanelLockGestureTracker('longPress',toggle);
    hold.start('files',10,10,1);vi.advanceTimersByTime(300);hold.start('scratch',20,20,2);
    hold.move(900,900,1);hold.end(1);vi.advanceTimersByTime(PANEL_LOCK_HOLD_MS);
    expect(toggle.mock.calls).toEqual([['scratch']]);
  });
});
