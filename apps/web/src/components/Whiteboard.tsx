import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowUpRight,
  Brush,
  ChevronDown,
  ChevronUp,
  Circle,
  Highlighter,
  ImagePlus,
  LoaderCircle,
  Minus,
  MousePointer2,
  Move,
  Pen,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { LIMITS, type BoardElement } from '@callyou/shared';
import type { CallYouSocket } from '../socket';
import { useBoard } from '../hooks/useBoard';
import { useI18n, type MessageKey } from '../i18n';
import { TextDialog } from './Modal';
import { prepareBoardAssets } from '../boardAssets';
type Tool =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'text'
  | 'pan';
type Point = { x: number; y: number; pressure?: number | undefined };
const tools: Array<{ id: Tool; icon: typeof Pen; label: MessageKey }> = [
  { id: 'select', icon: MousePointer2, label: 'select' },
  { id: 'pen', icon: Pen, label: 'pen' },
  { id: 'highlighter', icon: Highlighter, label: 'highlighter' },
  { id: 'eraser', icon: Brush, label: 'eraser' },
  { id: 'line', icon: Minus, label: 'line' },
  { id: 'arrow', icon: ArrowUpRight, label: 'arrow' },
  { id: 'rectangle', icon: Square, label: 'rectangle' },
  { id: 'ellipse', icon: Circle, label: 'ellipse' },
  { id: 'text', icon: Type, label: 'text' },
  { id: 'pan', icon: Move, label: 'pan' },
];
function path(points: Point[], ox = 0, oy = 0) {
  if (!points.length) return '';
  return points.reduce((d, p, i) => `${d}${i ? ' L' : 'M'} ${p.x + ox} ${p.y + oy}`, '');
}
function bounds(el: BoardElement) {
  if (el.type === 'pen' || el.type === 'highlighter') {
    const points = el.points ?? [];
    const xs = points.map((p) => p.x + el.x),
      ys = points.map((p) => p.y + el.y);
    return {
      x: Math.min(...xs, el.x),
      y: Math.min(...ys, el.y),
      width: Math.max(1, Math.max(...xs, el.x) - Math.min(...xs, el.x)),
      height: Math.max(1, Math.max(...ys, el.y) - Math.min(...ys, el.y)),
    };
  }
  return {
    x: Math.min(el.x, el.x + (el.width ?? 0)),
    y: Math.min(el.y, el.y + (el.height ?? 0)) - (el.type === 'text' ? 24 : 0),
    width: Math.max(
      20,
      Math.abs(el.width ?? Math.max(50, (el.text?.length ?? 1) * el.strokeWidth * 5)),
    ),
    height: Math.max(20, Math.abs(el.height ?? 32) + (el.type === 'text' ? 24 : 0)),
  };
}
function renderElement(el: BoardElement, selected = false) {
  const common = {
    stroke: el.strokeColor,
    strokeWidth: el.strokeWidth,
    opacity: el.opacity,
    fill: el.fillColor ?? 'none',
    vectorEffect: 'non-scaling-stroke' as const,
    'data-element-id': el.id,
  };
  let node: React.ReactNode;
  if (el.type === 'pen' || el.type === 'highlighter')
    node = (
      <path
        d={path(el.points ?? [], el.x, el.y)}
        {...common}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  else if (el.type === 'line' || el.type === 'arrow')
    node = (
      <line
        x1={el.x}
        y1={el.y}
        x2={el.x + (el.width ?? 0)}
        y2={el.y + (el.height ?? 0)}
        {...common}
        markerEnd={el.type === 'arrow' ? 'url(#arrowhead)' : undefined}
      />
    );
  else if (el.type === 'rectangle')
    node = (
      <rect
        x={Math.min(el.x, el.x + (el.width ?? 0))}
        y={Math.min(el.y, el.y + (el.height ?? 0))}
        width={Math.abs(el.width ?? 0)}
        height={Math.abs(el.height ?? 0)}
        {...common}
      />
    );
  else if (el.type === 'ellipse')
    node = (
      <ellipse
        cx={el.x + (el.width ?? 0) / 2}
        cy={el.y + (el.height ?? 0) / 2}
        rx={Math.abs(el.width ?? 0) / 2}
        ry={Math.abs(el.height ?? 0) / 2}
        {...common}
      />
    );
  else if (el.type === 'image')
    node = (
      <image
        href={el.assetData}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        preserveAspectRatio="xMidYMid meet"
        opacity={el.opacity}
        data-element-id={el.id}
      />
    );
  else
    node = (
      <text
        x={el.x}
        y={el.y}
        fill={el.strokeColor}
        opacity={el.opacity}
        fontSize={Math.max(14, el.strokeWidth * 7)}
        data-element-id={el.id}
        style={{ whiteSpace: 'pre' }}
      >
        {el.text}
      </text>
    );
  const box = bounds(el);
  return (
    <g key={el.id} className="board-element">
      {node}
      {selected && (
        <>
          <rect
            className="selection-box"
            x={box.x - 6}
            y={box.y - 6}
            width={box.width + 12}
            height={box.height + 12}
          />
          <circle
            className="resize-handle"
            data-element-id={el.id}
            data-resize-id={el.id}
            cx={box.x + box.width + 6}
            cy={box.y + box.height + 6}
            r="6"
          />
        </>
      )}
    </g>
  );
}
export function Whiteboard({
  socket,
  participantId,
  isHost,
  onClear,
  onNotice,
}: {
  socket: CallYouSocket;
  participantId: string;
  isHost: boolean;
  onClear: () => void;
  onNotice: (message: string) => void;
}) {
  const { t } = useI18n();
  const board = useBoard(socket);
  const svg = useRef<SVGSVGElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#172554');
  const [width, setWidth] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: -500, y: -350 });
  const [draft, setDraft] = useState<BoardElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [textDialog, setTextDialog] = useState<{
    point: Point;
    element?: BoardElement;
  } | null>(null);
  const action = useRef<{
    start: Point;
    original?: BoardElement;
    mode: 'draw' | 'move' | 'resize' | 'pan';
  } | null>(null);
  const remoteStrokes = useRef(
    new Map<string, { points: Point[]; color: string; width: number; opacity: number }>(),
  );
  const cursors = useRef(
    new Map<string, { x: number; y: number; name: string; color: string; seen: number }>(),
  );
  const [, render] = useState(0);
  const lastCursorEmit = useRef(0);
  const lastStrokeEmit = useRef(0);
  const world = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const box = svg.current?.getBoundingClientRect();
      return {
        x: (event.clientX - (box?.left ?? 0)) / zoom + pan.x,
        y: (event.clientY - (box?.top ?? 0)) / zoom + pan.y,
      };
    },
    [pan, zoom],
  );
  useEffect(() => {
    const stroke = (data: {
      participantId: string;
      id: string;
      points: Point[];
      color: string;
      width: number;
      opacity: number;
    }) => {
      remoteStrokes.current.set(`${data.participantId}:${data.id}`, data);
      render((v) => v + 1);
    };
    const end = (data: { participantId: string; id: string }) => {
      remoteStrokes.current.delete(`${data.participantId}:${data.id}`);
      render((v) => v + 1);
    };
    const cursor = (data: {
      participantId: string;
      displayName: string;
      color: string;
      x: number;
      y: number;
    }) => {
      cursors.current.set(data.participantId, {
        x: data.x,
        y: data.y,
        name: data.displayName,
        color: data.color,
        seen: Date.now(),
      });
      render((v) => v + 1);
    };
    socket.on('board:live-stroke', stroke);
    socket.on('board:live-stroke-end', end);
    socket.on('participant:cursor', cursor);
    const timer = setInterval(() => {
      for (const [id, c] of cursors.current)
        if (Date.now() - c.seen > 5000) cursors.current.delete(id);
      render((v) => v + 1);
    }, 3000);
    return () => {
      clearInterval(timer);
      socket.off('board:live-stroke', stroke);
      socket.off('board:live-stroke-end', end);
      socket.off('participant:cursor', cursor);
    };
  }, [socket]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) board.redo();
        else board.undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        board.redo();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
        event.preventDefault();
        board.remove(selected);
        setSelected(null);
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)
      ) {
        const map: Record<string, Tool> = {
          v: 'select',
          p: 'pen',
          h: 'highlighter',
          e: 'eraser',
          l: 'line',
          a: 'arrow',
          r: 'rectangle',
          o: 'ellipse',
          t: 'text',
        };
        const next = map[event.key.toLowerCase()];
        if (next) setTool(next);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [board, selected]);
  function targetId(event: { target: EventTarget }) {
    return (
      (event.target as Element).closest('[data-element-id]')?.getAttribute('data-element-id') ??
      null
    );
  }
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    svg.current?.setPointerCapture(event.pointerId);
    const p = world(event);
    const id = targetId(event);
    if (tool === 'eraser') {
      if (id) board.remove(id);
      return;
    }
    if (tool === 'text') {
      setTextDialog({ point: p });
      return;
    }
    if (tool === 'pan') {
      action.current = { start: p, mode: 'pan' };
      return;
    }
    if (tool === 'select') {
      setSelected(id);
      const original = board.elements.find((e) => e.id === id);
      if (original)
        action.current = {
          start: p,
          original,
          mode: (event.target as Element).hasAttribute('data-resize-id') ? 'resize' : 'move',
        };
      return;
    }
    const type = tool as BoardElement['type'];
    const element: BoardElement = {
      id: crypto.randomUUID(),
      type,
      createdBy: participantId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      x: type === 'pen' || type === 'highlighter' ? 0 : p.x,
      y: type === 'pen' || type === 'highlighter' ? 0 : p.y,
      points: type === 'pen' || type === 'highlighter' ? [p] : undefined,
      width: type === 'pen' || type === 'highlighter' ? undefined : 0,
      height: type === 'pen' || type === 'highlighter' ? undefined : 0,
      strokeColor: color,
      strokeWidth: type === 'highlighter' ? Math.max(12, width * 3) : width,
      opacity: type === 'highlighter' ? 0.28 : 1,
    };
    setDraft(element);
    action.current = { start: p, mode: 'draw' };
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const p = world(event);
    const now = performance.now();
    if (now - lastCursorEmit.current > 40) {
      socket.emit('participant:cursor', p);
      lastCursorEmit.current = now;
    }
    const current = action.current;
    if (!current) return;
    if (current.mode === 'pan') {
      setPan((v) => ({ x: v.x - (p.x - current.start.x), y: v.y - (p.y - current.start.y) }));
      return;
    }
    if (current.mode === 'move' && current.original) {
      const dx = p.x - current.start.x,
        dy = p.y - current.start.y;
      board.put({
        ...current.original,
        x: current.original.x + dx,
        y: current.original.y + dy,
        updatedAt: Date.now(),
      });
      return;
    }
    if (current.mode === 'resize' && current.original) {
      const original = current.original;
      if (original.type === 'pen' || original.type === 'highlighter') {
        const box = bounds(original),
          sx = Math.max(0.05, (p.x - box.x) / box.width),
          sy = Math.max(0.05, (p.y - box.y) / box.height);
        const points = (original.points ?? []).map((point) => ({
          x: box.x + (point.x + original.x - box.x) * sx,
          y: box.y + (point.y + original.y - box.y) * sy,
          pressure: point.pressure,
        }));
        board.put({ ...original, x: 0, y: 0, points, updatedAt: Date.now() });
      } else if (original.type === 'image')
        board.put({
          ...original,
          width: Math.max(80, p.x - original.x),
          height: Math.max(80, p.y - original.y),
          updatedAt: Date.now(),
        });
      else
        board.put({
          ...original,
          width: p.x - original.x,
          height: p.y - original.y,
          updatedAt: Date.now(),
        });
      return;
    }
    if (!draft) return;
    if (draft.type === 'pen' || draft.type === 'highlighter') {
      const points = [...(draft.points ?? [])];
      const last = points.at(-1);
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1.5)
        points.push({ ...p, pressure: event.pressure || 0.5 });
      const next = { ...draft, points };
      setDraft(next);
      if (now - lastStrokeEmit.current > 32) {
        socket.emit('board:live-stroke', {
          id: draft.id,
          points: points.slice(-256),
          color: draft.strokeColor,
          width: draft.strokeWidth,
          opacity: draft.opacity,
        });
        lastStrokeEmit.current = now;
      }
    } else setDraft({ ...draft, width: p.x - current.start.x, height: p.y - current.start.y });
  }
  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    svg.current?.releasePointerCapture(event.pointerId);
    if (draft) {
      board.put({ ...draft, updatedAt: Date.now() });
      socket.emit('board:live-stroke-end', { id: draft.id });
      setDraft(null);
    }
    action.current = null;
  }
  function wheel(event: React.WheelEvent) {
    event.preventDefault();
    setZoom((v) => Math.max(0.2, Math.min(5, v * Math.exp(-event.deltaY * 0.001))));
  }
  function editText(event: React.MouseEvent<SVGSVGElement>) {
    const id = targetId(event);
    const element = board.elements.find((value) => value.id === id && value.type === 'text');
    if (!element) return;
    setTextDialog({ point: { x: element.x, y: element.y }, element });
  }
  function saveText(value: string) {
    if (!textDialog) return;
    const now = Date.now();
    board.put(
      textDialog.element
        ? { ...textDialog.element, text: value.slice(0, LIMITS.boardText), updatedAt: now }
        : {
            id: crypto.randomUUID(),
            type: 'text',
            createdBy: participantId,
            createdAt: now,
            updatedAt: now,
            x: textDialog.point.x,
            y: textDialog.point.y,
            text: value.slice(0, LIMITS.boardText),
            strokeColor: color,
            strokeWidth: width,
            opacity: 1,
          },
    );
    setTextDialog(null);
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    if (board.elements.filter((element) => element.type === 'image').length >= LIMITS.boardAssets) {
      onNotice(t('tooManyPages'));
      return;
    }
    setImporting(true);
    try {
      const assets = await prepareBoardAssets(file);
      const existing = board.elements.filter((element) => element.type === 'image').length;
      if (existing + assets.length > LIMITS.boardAssets) throw new Error('too_many_pages');
      const centerX = pan.x + (svg.current?.clientWidth ?? 1200) / (2 * zoom);
      let nextY = pan.y + 110 / zoom;
      for (const asset of assets) {
        const displayWidth = Math.min(760, asset.width);
        const displayHeight = (asset.height / asset.width) * displayWidth;
        const now = Date.now();
        board.put({
          id: crypto.randomUUID(),
          type: 'image',
          createdBy: participantId,
          createdAt: now,
          updatedAt: now,
          x: centerX - displayWidth / 2,
          y: nextY,
          width: displayWidth,
          height: displayHeight,
          assetName: asset.name.slice(0, 120),
          assetData: asset.data,
          strokeColor: '#94a3b8',
          strokeWidth: 1,
          opacity: 1,
        });
        nextY += displayHeight + 32;
      }
      setTool('select');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      onNotice(
        t(
          code === 'too_many_pages'
            ? 'tooManyPages'
            : code === 'source_too_large' || code === 'asset_too_large'
              ? 'boardFileTooLarge'
              : code === 'unsupported_file'
                ? 'unsupportedFile'
                : 'boardAssetFailed',
        ),
      );
    } finally {
      setImporting(false);
    }
  }
  return (
    <section className="board-shell">
      <nav className="board-toolbar" aria-label="Whiteboard tools">
        {tools.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            className={tool === id ? 'active' : ''}
            onClick={() => setTool(id)}
            title={t(label)}
            aria-label={t(label)}
          >
            <Icon />
          </button>
        ))}
        <span className="divider" />
        <button
          className="board-file-button"
          title={t('addBoardFile')}
          aria-label={t('addBoardFile')}
          disabled={importing}
          onClick={() => fileInput.current?.click()}
        >
          {importing ? <LoaderCircle className="spinning" /> : <ImagePlus />}
          <span>{importing ? t('importing') : t('addBoardFile')}</span>
        </button>
        <input
          ref={fileInput}
          className="board-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          disabled={importing}
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <span className="divider" />
        <label className="color-control" title="Color">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label className="width-control">
          <input
            aria-label="Stroke width"
            type="range"
            min="1"
            max="24"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <span className="divider" />
        <button onClick={board.undo} title={t('undo')}>
          <Undo2 />
        </button>
        <button onClick={board.redo} title={t('redo')}>
          <Redo2 />
        </button>
        {isHost && (
          <button className="clear-board-button" onClick={onClear} title={t('clearBoard')}>
            <Trash2 />
            <span>{t('clearBoard')}</span>
          </button>
        )}
      </nav>
      <svg
        ref={svg}
        className={`whiteboard tool-${tool}`}
        role="application"
        aria-label="Shared whiteboard"
        viewBox={`${pan.x} ${pan.y} ${(svg.current?.clientWidth ?? 1200) / zoom} ${(svg.current?.clientHeight ?? 800) / zoom}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onWheel={wheel}
        onDoubleClick={editText}
      >
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#cbd5e1" />
          </pattern>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L10,3.5 L0,7 Z" fill="#172554" />
          </marker>
        </defs>
        <rect x="-100000" y="-100000" width="200000" height="200000" fill="#fff" />
        <rect x="-100000" y="-100000" width="200000" height="200000" fill="url(#grid)" />
        {board.elements.map((el) => renderElement(el, el.id === selected))}
        {draft && renderElement(draft)}
        {[...remoteStrokes.current].map(([id, s]) => (
          <path
            key={id}
            d={path(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            opacity={s.opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {[...cursors.current].map(([id, c]) => (
          <g key={id} transform={`translate(${c.x} ${c.y})`} className="collaborator-cursor">
            <path d="M0 0 L4 17 L8 10 L15 8 Z" fill={c.color} />
            <text x="12" y="22" fill={c.color}>
              {c.name}
            </text>
          </g>
        ))}
      </svg>
      <div className="zoom-controls">
        <button onClick={() => setZoom((v) => Math.min(5, v * 1.2))}>
          <ChevronUp />
        </button>
        <output>{Math.round(zoom * 100)}%</output>
        <button onClick={() => setZoom((v) => Math.max(0.2, v / 1.2))}>
          <ChevronDown />
        </button>
      </div>
      {textDialog && (
        <TextDialog
          initialValue={textDialog.element?.text}
          onCancel={() => setTextDialog(null)}
          onSave={saveText}
        />
      )}
    </section>
  );
}
