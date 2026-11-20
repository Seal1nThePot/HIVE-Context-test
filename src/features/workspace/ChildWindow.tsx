import {useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from "../../shared/icons";
import {usePanelDocument} from '../../shared/panelDocument';
import {DesktopPanel, useDesktopPanels} from './DesktopPanels';
import './child-window.css';

type Props = {
  id: 'outline-node-editor' | 'custom-color-settings';
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  children: ReactNode;
};

export default function ChildWindow(props: Props) {
  const [fallback, setFallback] = useState(false);
  if (typeof window === 'undefined' || !window.hiveDesktop?.isDesktop || fallback) return <BrowserChildWindow {...props}/>;
  return <NativeChildWindow {...props} onFailure={() => setFallback(true)}/>;
}

function WindowHeading({id, title, onClose, closeDisabled}: Omit<Props, 'children' | 'id'> & {id: string}) {
  return <header className="child-window-heading">
    <h2 id={id}>{title}</h2>
    <button type="button" className="icon-button" aria-label={`关闭${title}`} disabled={closeDisabled} onClick={onClose}><X size={17}/></button>
  </header>;
}

function NativeChildWindow({id, title, onClose, onFailure, closeDisabled, children}: Props & {onFailure: () => void}) {
  const desktop = useDesktopPanels();
  const titleId = useId();
  const surface = useRef<HTMLDivElement>(null);
  const latest = useRef({onClose, closeDisabled});
  latest.current = {onClose, closeDisabled};

  useEffect(() => {
    let ready = false;
    const timer = window.setTimeout(() => desktop.detach(id, {
      onReady: () => {
        ready = true;
        (surface.current?.querySelector<HTMLElement>('[data-child-window-focus]') ?? surface.current?.querySelector<HTMLElement>('.child-window-heading button'))?.focus();
      },
      onFailure,
      onReturn: () => { if (ready) latest.current.onClose(); },
    }), 0);
    const requestClose = (event: Event) => {
      if ((event as CustomEvent).detail !== id || !latest.current.closeDisabled) return;
      event.preventDefault();
    };
    window.addEventListener('hive:panel-close-requested', requestClose);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('hive:panel-close-requested', requestClose);
    };
  }, [id]);

  return <DesktopPanel id={id} title={title} open>
    <div ref={surface} data-panel-id={id} role="dialog" aria-modal="true" aria-labelledby={titleId}
      className={`child-window child-window-native child-window-${id}`}
      onKeyDown={event => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing && !event.defaultPrevented) {
          event.preventDefault();
          if (!closeDisabled) onClose();
        }
      }}>
      <WindowHeading id={titleId} title={title} onClose={onClose} closeDisabled={closeDisabled}/>
      {children}
    </div>
  </DesktopPanel>;
}

function BrowserChildWindow({id, title, onClose, closeDisabled, children}: Props) {
  const owner = usePanelDocument();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const restoreFocus = owner.activeElement as HTMLElement | null;
    element.showModal();
    const focus = element.querySelector<HTMLElement>('[data-child-window-focus]');
    focus?.focus();
    return () => {
      element.close();
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, [owner]);

  return createPortal(
    <dialog ref={dialog} className={`child-window child-window-fallback child-window-${id}`} aria-labelledby={titleId}
      onCancel={event => {event.preventDefault(); if (!closeDisabled) onClose();}}
      onKeyDown={event => event.stopPropagation()}>
      <WindowHeading id={titleId} title={title} onClose={onClose} closeDisabled={closeDisabled}/>
      {children}
    </dialog>,
    owner.body,
  );
}
