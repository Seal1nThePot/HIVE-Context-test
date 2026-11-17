import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { minimalReplacement } from '../../shared/core';
import {mapStoredSessionContext} from '../editor/storedDocumentChanges';
import type { ApiClient } from '../../shared/api';
import type { DiskFile } from '../../shared/fileTypes';
import type { EditorSession } from '../editor/editorSessionTypes';
import type { Entry } from './explorerState';
import type { WorkspaceInfo } from './WorkspaceContext';
import { diskSyncDecision } from './fileSync';
import {documentMatchesText} from '../editor/documentText';
import {beginFileActivity} from './fileOperations';
import type {Transaction} from '@codemirror/state';
import {documentSyncBaselines,pollAfterCompletion,workspaceTreeSync} from './workspaceSync';
type PersistenceOptions = {
    api: ApiClient;
    workspace?:Pick<WorkspaceInfo,'id'|'root'>;
    sessions: RefObject<Map<string, EditorSession>>;
    activeSession: RefObject<string>;
    disk: RefObject<DiskFile | null>;
    switching: RefObject<boolean>;
    structuring: RefObject<boolean>;
    fileBusy: boolean;
    tick: number;
    autoSave: boolean;
    setDirty: (dirty: boolean) => void;
    setFileBusy: (busy: boolean) => void;
    setEntries: Dispatch<SetStateAction<Entry[]>>;
    setError: (message: string) => void;
    inform: (message: string) => void;
    redraw: () => void;
    appAlive?:RefObject<boolean>;
    onStoredChange?:(id:string,transaction:Transaction)=>void;
};
export function useDocumentPersistence({ api, workspace, sessions, activeSession, disk, switching, structuring, fileBusy, tick, autoSave, setDirty, setFileBusy, setEntries, setError, inform, redraw,appAlive,onStoredChange }: PersistenceOptions) {
    const savingPaths = useRef(new Set<string>()), syncRunning = useRef(false);
    const treeSync=workspaceTreeSync(setEntries,workspace),lifecycle=useRef(0);
    const [fileConflicts, setFileConflicts] = useState<Record<string, string>>({});
    const conflicts = useRef<Record<string, string>>({});
    const readFailures=useRef(new Map<string,{message:string;owner:number}>());
    function setConflict(path: string, message: string) { readFailures.current.delete(path); if (conflicts.current[path] === message)
        return; conflicts.current = { ...conflicts.current, [path]: message }; setFileConflicts(conflicts.current); }
    function setReadFailure(path:string,message:string) {
        const previous=readFailures.current.get(path),owner=treeSync.owner();
        // A failed read must not hide a save failure or an unresolved content conflict.
        if(conflicts.current[path]&&(!previous||previous.owner!==owner||previous.message!==conflicts.current[path]))return;
        setConflict(path,message);readFailures.current.set(path,{message,owner});
    }
    function clearReadFailure(path:string) {
        const failure=readFailures.current.get(path);
        if(failure?.owner===treeSync.owner()&&conflicts.current[path]===failure.message)setConflict(path,'');
    }
    async function saveSession(id: string, quiet = false): Promise<boolean> {
        const session = sessions.current.get(id), source = session?.disk, state = session?.view?.state || session?.state;
        if (!session || !state)
            return true;
        if (!source)
            return !session.dirty;
        if (savingPaths.current.has(source.path))
            return false;
        const snapshot = state.doc.toString();
        const owners=new Map([...sessions.current.values()].filter(other=>other.disk?.path===source.path).map(other=>[other.id,{session:other,disk:other.disk}]));
        savingPaths.current.add(source.path);
        const release=quiet?()=>{}:beginFileActivity(sessions,value=>{if(appAlive?.current!==false)setFileBusy(value);});
        try {
            const result = await api<{
                hash: string;
            }>("/file", { path: source.path, text: snapshot, baseline: source.hash, eol: source.eol, bom: source.bom });
            if(appAlive?.current===false)return true;
            let adopted=false;
            for (const other of sessions.current.values()) {
                if (other.disk?.path !== source.path)
                    continue;
                const owner=owners.get(other.id);
                if(owner?(owner.session!==other||owner.disk!==other.disk):(other.disk.hash!==source.hash||other.disk.text!==source.text))continue;
                adopted=true;
                other.disk = { ...source, text: snapshot, hash: result.hash };
                other.dirty = !(other.view?.state || other.state)?.doc.eq(state.doc);
            }
            const current = sessions.current.get(activeSession.current)!;
            if(current){disk.current = current.disk;setDirty(current.dirty);}
            if(adopted)setConflict(source.path, '');
            redraw();
            if (!quiet)
                inform('已保存到本机。');
            return true;
        }
        catch (error) {
            if(appAlive?.current===false)return false;
            const relevant=[...owners.values()].some(owner=>sessions.current.get(owner.session.id)===owner.session&&owner.session.disk===owner.disk);
            if(!relevant)return false;
            setConflict(source.path, (error as Error).message);
            if (!quiet)
                setError((error as Error).message);
            return false;
        }
        finally {
            savingPaths.current.delete(source.path);
            release();
        }
    }
    function applyDiskFile(data: DiskFile) {
        if(appAlive?.current===false)return;
        const changesByDocument=new Map<NonNullable<EditorSession['state']>['doc'],{from:number;to:number;insert:string}>();
        for (const session of sessions.current.values()) {
            if (session.disk?.path !== data.path)
                continue;
            const state = session.view?.state || session.state;
            if (!state)
                continue;
            const unchanged=documentMatchesText(state.doc,data.text);
            session.disk = { ...data };
            session.dirty = false;
            if (session.id === activeSession.current)
                disk.current = session.disk;
            if (!unchanged) {
                let changes=changesByDocument.get(state.doc);
                if(!changes){
                    const before=state.doc.toString();
                    const change = minimalReplacement({ from: 0, to: before.length, original: before, file: data.path, stale: false }, data.text);
                    changes={from:change.from,to:change.to,insert:change.text};changesByDocument.set(state.doc,changes);
                }
                if (session.view)
                    session.view.dispatch({ changes, userEvent: 'input.disk-sync' });
                else {
                    const transaction=state.update({changes});session.state=transaction.state;
                    session.contentVersion=(session.contentVersion||0)+1;
                    mapStoredSessionContext(session.context,transaction);
                    onStoredChange?.(session.id,transaction);
                }
            }
        }
        const active = sessions.current.get(activeSession.current)!;
        disk.current = active.disk;
        setDirty(active.dirty);
        setConflict(data.path, '');
        redraw();
    }
    const syncLatest = useRef(async () => { });
    syncLatest.current = async () => {
        const ticket=treeSync.beginSync();
        if (!ticket || syncRunning.current || switching.current || fileBusy || structuring.current || appAlive?.current===false)
            return;
        syncRunning.current = true;
        const owner=sessions.current,generation=lifecycle.current;
        const valid=()=>lifecycle.current===generation&&sessions.current===owner&&appAlive?.current!==false&&!switching.current&&!structuring.current&&treeSync.current(ticket);
        try {
            const {paths,baselines,knownBaselines}=documentSyncBaselines(owner.values());
            const data = await api<{
                entries?: Entry[];
                treeVersion: string;
                workspace: WorkspaceInfo;
                files: (DiskFile | {
                    path: string;
                    error: string;
                } | {
                    path: string;
                    hash: string;
                    unchanged: true;
                })[];
            }>('/workspace/sync', { paths, baselines: knownBaselines,...(ticket.treeVersion===undefined?{}:{treeVersion:ticket.treeVersion}) });
            if(!valid()||!treeSync.current(ticket,data.workspace))return;
            treeSync.accept(ticket,data.treeVersion);
            if(data.entries!==undefined)setEntries(data.entries);
            for (const remote of data.files) {
                if (savingPaths.current.has(remote.path))
                    continue;
                const matching = [...sessions.current.values()].filter(session => session.disk?.path === remote.path);
                if (matching.some(session => session.disk?.hash !== baselines.get(remote.path)))
                    continue;
                if ('error' in remote) {
                    if (matching.length)
                        setReadFailure(remote.path, remote.error + ' 本地内容仍保留，可另存副本。');
                    continue;
                }
                if ('unchanged' in remote) {
                    clearReadFailure(remote.path);
                    continue;
                }
                const decision = diskSyncDecision(matching.map(session => ({ baseline: session.disk!, text: (session.view?.state || session.state)?.doc || '' })), remote);
                if (decision === 'unchanged') {
                    clearReadFailure(remote.path);
                    continue;
                }
                if (decision === 'conflict') {
                    setConflict(remote.path, '磁盘和本地都有修改，已暂停自动保存。请核对后重新读取，或另存本地副本。');
                    continue;
                }
                applyDiskFile(remote);
            }
        }
        catch (error) {
            if(valid())setError((error as Error).message);
        }
        finally {
            syncRunning.current = false;
        }
    };
    useEffect(() => {
        lifecycle.current++;
        const stop=pollAfterCompletion(()=>syncLatest.current(),2000);
        return ()=>{lifecycle.current++;stop();};
    }, []);
    useEffect(() => {
        if (!autoSave || switching.current || structuring.current)
            return;
        const timer = setTimeout(() => {
            for (const session of sessions.current.values())
                if (session.dirty && session.disk && !conflicts.current[session.disk.path])
                    void saveSession(session.id, true);
        }, 900);
        return () => clearTimeout(timer);
    }, [tick, autoSave,fileConflicts]);
    return { savingPaths, fileConflicts, saveSession, applyDiskFile };
}
