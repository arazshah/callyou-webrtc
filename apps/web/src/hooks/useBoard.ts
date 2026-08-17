import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { BoardElement } from '@callyou/shared';
import type { CallYouSocket } from '../socket';
const remoteOrigin = { remote: true };
export function useBoard(socket: CallYouSocket | null) {
  const doc = useMemo(() => new Y.Doc(), []);
  const elements = useMemo(() => doc.getMap<BoardElement>('elements'), [doc]);
  const localOrigin = useRef({ local: true });
  const undoManager = useMemo(
    () =>
      new Y.UndoManager(elements, {
        trackedOrigins: new Set([localOrigin.current]),
        captureTimeout: 400,
      }),
    [elements],
  );
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!socket) return;
    const update = (data: Uint8Array) => Y.applyUpdate(doc, new Uint8Array(data), remoteOrigin);
    const cleared = () => socket.emit('board:sync-request');
    socket.on('board:sync', update);
    socket.on('board:yjs-update', update);
    socket.on('board:cleared', cleared);
    const onUpdate = (data: Uint8Array, origin: unknown) => {
      setVersion((v) => v + 1);
      if (origin !== remoteOrigin) socket.emit('board:yjs-update', data);
    };
    doc.on('update', onUpdate);
    socket.emit('board:sync-request');
    return () => {
      socket.off('board:sync', update);
      socket.off('board:yjs-update', update);
      socket.off('board:cleared', cleared);
      doc.off('update', onUpdate);
    };
  }, [doc, socket]);
  const transact = (fn: () => void) => doc.transact(fn, localOrigin.current);
  return {
    elements: [...elements.values()],
    version,
    put: (value: BoardElement) => transact(() => elements.set(value.id, value)),
    remove: (id: string) => transact(() => elements.delete(id)),
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
  };
}
