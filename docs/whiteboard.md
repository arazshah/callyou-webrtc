# Whiteboard

The board is an SVG infinite coordinate plane with participant-local pan and zoom. Pointer coordinates are transformed into this stable world space, so different screens and zoom levels converge. Pointer Events support mouse, touch, stylus, and pressure fields.

Persistent elements live in a `Y.Map` keyed by UUID. Each operation updates only its object; concurrent unrelated edits cannot replace the entire scene. A `Y.UndoManager` tracks only the current client's transaction origin. High-frequency strokes are previewed as throttled ephemeral point batches, then committed once on pointer-up. Cursors are throttled and stale presence is removed.

The server applies an update to a candidate document before accepting it. It validates every element, caps individual updates at 900 KiB, the scene at 10,000 objects, imported assets at 12, image data at 650,000 characters, text at 2,000 characters, and strokes at 5,000 points. Accepted updates are broadcast and snapshots are debounced to PostgreSQL. Refresh/rejoin receives the current encoded state.

Images are resized and encoded as bounded WebP data before entering the Yjs document. PDF.js renders each PDF page locally into the same image format, so collaborators can draw over it without the original document leaving the browser as a separate upload. Board images are part of the PostgreSQL snapshot and can be read by the application server.

Shortcuts: `P` pen, `H` highlighter, `E` eraser, `V` select, `L` line, `A` arrow, `R` rectangle, `O` ellipse, `T` text, Delete/Backspace removes selection, Ctrl/Cmd-Z undo, Ctrl/Cmd-Shift-Z or Ctrl/Cmd-Y redo. Host clear requires browser confirmation.
