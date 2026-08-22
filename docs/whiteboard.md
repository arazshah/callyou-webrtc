# Whiteboard

The board is an SVG coordinate plane with a large world-space viewport, participant-local pan/zoom, mouse wheel zoom, and two-finger pinch zoom. Pointer coordinates are transformed into stable world space, so different screens and zoom levels converge. Pointer Events support mouse, touch, stylus, pressure fields, and a temporary laser pointer.

Persistent elements live in a `Y.Map` keyed by UUID and are grouped into bounded Yjs pages. Each operation updates only its object; concurrent unrelated edits cannot replace the entire scene. A `Y.UndoManager` tracks only the current client's transaction origin. High-frequency strokes are previewed as throttled ephemeral point batches, then committed once on pointer-up. Cursors, viewport/follow-presenter state, and the laser pointer are ephemeral.

The server applies an update to a candidate document before accepting it. It validates every element, caps individual updates at 900 KiB, the scene at 10,000 objects, imported assets at 12, image data at 650,000 characters, text at 2,000 characters, and strokes at 5,000 points. Accepted updates are broadcast and snapshots are debounced to PostgreSQL. Refresh/rejoin receives the current encoded state.

Images are resized and encoded as bounded WebP data before entering the Yjs document. PDF.js renders each PDF page locally into the same image format, so collaborators can draw over it without the original document leaving the browser as a separate upload. Board images are part of the PostgreSQL snapshot and can be read by the application server. Selected images support fit-to-page, aspect-ratio resize, rotation, duplication, layer ordering, and locking.

The current page can be exported as SVG or PNG. The print action opens a clean page that can be saved as PDF by the browser's print dialog. A session JSON export contains all pages, elements, and locally embedded assets for archival; no board data is uploaded for export.

Shortcuts: `P` pen, `H` highlighter, `E` eraser, `V` select, `L` line, `A` arrow, `R` rectangle, `O` ellipse, `T` text, Delete/Backspace removes selection, Ctrl/Cmd-Z undo, Ctrl/Cmd-Shift-Z or Ctrl/Cmd-Y redo. Smart shape recognition is opt-in and converts simple freehand lines, rectangles, and ellipses. Host clear requires browser confirmation.
