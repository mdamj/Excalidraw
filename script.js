const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const board = document.getElementById('board');
const textInput = document.getElementById('textInput');

function resizeCanvas() {
  canvas.width = board.clientWidth; 
  canvas.height = board.clientHeight;
  render();
}

let shapes = [];              
let currentTool = 'pencil';
let color = '#1e1e1e';
let lineSize = 3;
let selected = null;
let preview = null;         
let drag = null;             
let textPos = null;

let undoStack = [];
let historyIndex = -1;

function drawShape(s) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (s.type === 'pencil') {
    ctx.beginPath();
    ctx.moveTo(s.points[0][0], s.points[0][1]);
    for (const p of s.points) ctx.lineTo(p[0], p[1]);
    if (s.points.length === 1) ctx.lineTo(s.points[0][0] + 0.01, s.points[0][1]);
    ctx.stroke();
  } else if (s.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  } else if (s.type === 'rectangle') {
    ctx.strokeRect(s.x, s.y, s.width, s.height);
  } else if (s.type === 'circle') {
    ctx.beginPath();
    ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.type === 'text') {
    ctx.font = textFont(s);
    ctx.textBaseline = 'top';     
    s.text.split('\n').forEach((line, i) => ctx.fillText(line, s.x, s.y + i * lineHeight(s)));
  }
}

const textFont = (s) => `${14 + s.size * 3}px "Segoe Print", "Comic Sans MS", cursive`;
const lineHeight = (s) => 18 + s.size * 3;

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  shapes.forEach(drawShape);
  if (preview) drawShape(preview);

  if (selected) {       
    const b = bounds(selected);
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#6965db';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
    ctx.restore();
  }
  undoBtn.disabled = historyIndex < 0;
  redoBtn.disabled = historyIndex >= undoStack.length - 1;
}

/* ===== Lesson 5: bounds, hit testing, moving ===== */
function bounds(s) {
  if (s.type === 'pencil') {
    const xs = s.points.map(p => p[0]), ys = s.points.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (s.type === 'line') {
    return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
  }
  if (s.type === 'circle') return { x: s.cx - s.r, y: s.cy - s.r, w: s.r * 2, h: s.r * 2 };
  if (s.type === 'text') {
    ctx.font = textFont(s);
    const lines = s.text.split('\n');
    const w = Math.max(...lines.map(l => ctx.measureText(l).width));
    return { x: s.x, y: s.y, w, h: lines.length * lineHeight(s) };
  }
  return { x: s.x, y: s.y, w: s.width, h: s.height };   // rectangle
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hitTest(s, x, y) {
  const tol = 6 + s.size / 2;
  if (s.type === 'pencil') {
    if (s.points.length === 1) return Math.hypot(x - s.points[0][0], y - s.points[0][1]) < tol;
    for (let i = 0; i < s.points.length - 1; i++) {
      if (distToSegment(x, y, ...s.points[i], ...s.points[i + 1]) < tol) return true;
    }
    return false;
  }
  if (s.type === 'line') return distToSegment(x, y, s.x1, s.y1, s.x2, s.y2) < tol;
  if (s.type === 'circle') return Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) < tol;
  if (s.type === 'rectangle') {  
    return x >= s.x - tol && x <= s.x + s.width + tol && y >= s.y - tol && y <= s.y + s.height + tol;
  }
  const b = bounds(s); 
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

function shapeAt(x, y) {        
  for (let i = shapes.length - 1; i >= 0; i--) if (hitTest(shapes[i], x, y)) return shapes[i];
  return null;
}

function moveShape(s, dx, dy) {
  if (s.type === 'pencil') s.points.forEach(p => { p[0] += dx; p[1] += dy; });
  else if (s.type === 'line') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  else if (s.type === 'circle') { s.cx += dx; s.cy += dy; }
  else { s.x += dx; s.y += dy; }
}

function record(action) {
  undoStack.length = historyIndex + 1; 
  undoStack.push(action);
  historyIndex++;
  render();
}

function undo() {
  commitText();
  if (historyIndex < 0) return;
  const a = undoStack[historyIndex];
  if (a.type === 'draw') shapes.splice(shapes.indexOf(a.shape), 1);
  else if (a.type === 'delete') [...a.items].sort((p, q) => p.index - q.index).forEach(it => shapes.splice(it.index, 0, it.shape));
  else if (a.type === 'move') moveShape(a.shape, -a.dx, -a.dy);
  else if (a.type === 'clear') shapes = a.shapes.slice();
  historyIndex--;
  if (!shapes.includes(selected)) selected = null;
  render();
}

function redo() {
  if (historyIndex >= undoStack.length - 1) return;
  const a = undoStack[historyIndex + 1];
  if (a.type === 'draw') shapes.push(a.shape);
  else if (a.type === 'delete') a.items.forEach(it => shapes.splice(shapes.indexOf(it.shape), 1));
  else if (a.type === 'move') moveShape(a.shape, a.dx, a.dy);
  else if (a.type === 'clear') shapes = [];
  historyIndex++;
  if (!shapes.includes(selected)) selected = null;
  render();
}

canvas.addEventListener('pointerdown', (e) => {
  const x = e.offsetX, y = e.offsetY;
  if (currentTool === 'text') { startText(x, y); return; }
  commitText();
  canvas.setPointerCapture(e.pointerId);  

  if (currentTool === 'select') {
    selected = shapeAt(x, y);
    drag = selected ? { lastX: x, lastY: y, totalX: 0, totalY: 0 } : null;
  } else if (currentTool === 'eraser') {
    drag = { removed: [] };
    eraseAt(x, y);
  } else if (currentTool === 'pencil') {
    drag = { startX: x, startY: y };
    preview = { type: 'pencil', points: [[x, y]], color, size: lineSize };
  } else {
    drag = { startX: x, startY: y };
    preview = makeShape(currentTool, x, y, x, y);
  }
  render();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const x = e.offsetX, y = e.offsetY;

  if (currentTool === 'select') {
    const dx = x - drag.lastX, dy = y - drag.lastY;
    moveShape(selected, dx, dy);
    drag.totalX += dx; drag.totalY += dy;
    drag.lastX = x; drag.lastY = y;
  } else if (currentTool === 'eraser') {
    eraseAt(x, y);
  } else if (currentTool === 'pencil') {
    preview.points.push([x, y]);
  } else {
    preview = makeShape(currentTool, drag.startX, drag.startY, x, y);
  }
  render();
});

function endGesture() {
  if (!drag) return;
  if (currentTool === 'select') {
    if (drag.totalX || drag.totalY) record({ type: 'move', shape: selected, dx: drag.totalX, dy: drag.totalY });
  } else if (currentTool === 'eraser') {
    if (drag.removed.length) record({ type: 'delete', items: drag.removed });
  } else if (preview) {
    const tooSmall = preview.type !== 'pencil' && boundsArea(preview) < 4;
    if (!tooSmall) {
      shapes.push(preview);
      record({ type: 'draw', shape: preview });
    }
    preview = null;
  }
  drag = null;
  render();
}
canvas.addEventListener('pointerup', endGesture);
canvas.addEventListener('pointercancel', endGesture);

function boundsArea(s) { const b = bounds(s); return b.w + b.h; }

function makeShape(tool, x1, y1, x2, y2) {
  const base = { type: tool, color, size: lineSize };
  if (tool === 'line') return { ...base, x1, y1, x2, y2 };
  if (tool === 'circle') return { ...base, cx: x1, cy: y1, r: Math.hypot(x2 - x1, y2 - y1) };
  // rectangle: normalise so width/height are never negative
  return { ...base, x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

function eraseAt(x, y) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitTest(shapes[i], x, y)) {
      drag.removed.push({ shape: shapes[i], index: i });
      shapes.splice(i, 1);
    }
  }
}
function startText(x, y) {
  commitText();
  selected = null;
  textPos = [x, y];
  Object.assign(textInput.style, {
    display: 'block', left: x + 'px', top: y + 'px',
    font: textFont({ size: lineSize }), color
  });
  textInput.value = '';
  setTimeout(() => textInput.focus(), 0);
}

function commitText() {
  if (textInput.style.display !== 'block') return;
  const value = textInput.value.trim();
  textInput.style.display = 'none';
  if (value && textPos) {
    const s = { type: 'text', x: textPos[0], y: textPos[1], text: value, color, size: lineSize };
    shapes.push(s);
    record({ type: 'draw', shape: s });
  }
  textPos = null;
}
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitText(); }
  if (e.key === 'Escape') { textInput.value = ''; commitText(); }
  e.stopPropagation();
});
textInput.addEventListener('blur', commitText);

const STORAGE_KEY = 'excalidraw-clone:sketch';
const KNOWN_TYPES = ['pencil', 'line', 'rectangle', 'circle', 'text'];

function saveSketch() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shapes));
    flash('Saved to this browser');
  } catch (err) {
    flash('Could not save: ' + err.message);
  }
}

function loadSketch() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(data)) return flash('Nothing saved yet');
    shapes = data.filter(s => s && KNOWN_TYPES.includes(s.type));  
    undoStack = [];              
    historyIndex = -1;
    selected = null;
    render();
    flash('Loaded');
  } catch (err) {
    flash('Could not load the saved sketch');
  }
}

function exportPNG() {
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const octx = out.getContext('2d');
  octx.fillStyle = '#fff';             
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvas, 0, 0);
  const a = document.createElement('a');
  a.download = 'sketch.png';
  a.href = out.toDataURL('image/png');
  a.click();
}

function flash(msg) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(flash.t);
  flash.t = setTimeout(() => el.classList.remove('show'), 2000);
}

const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

function setTool(tool) {
  commitText();
  currentTool = tool;
  if (tool !== 'select') selected = null;
  document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  canvas.style.cursor = tool === 'text' ? 'text' : tool === 'select' ? 'default' : 'crosshair';
  render();
}
document.querySelectorAll('#tools button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

document.getElementById('colorPicker').addEventListener('input', (e) => {
  color = e.target.value;
  if (selected) { selected.color = color; render(); }   // recolor the selected shape
});
document.getElementById('sizeSlider').addEventListener('input', (e) => {
  lineSize = +e.target.value;
  if (selected) { selected.size = lineSize; render(); }
});

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
document.getElementById('clearBtn').addEventListener('click', () => {
  if (!shapes.length || !confirm('Clear the whole canvas?')) return;
  const old = shapes.slice();
  shapes = [];
  selected = null;
  record({ type: 'clear', shapes: old });
});
document.getElementById('saveBtn').addEventListener('click', saveSketch);
document.getElementById('loadBtn').addEventListener('click', loadSketch);
document.getElementById('pngBtn').addEventListener('click', exportPNG);

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
    const index = shapes.indexOf(selected);
    shapes.splice(index, 1);
    record({ type: 'delete', items: [{ shape: selected, index }] });
    selected = null;
    render();
    return;
  }
  const tools = ['select', 'pencil', 'line', 'rectangle', 'circle', 'text', 'eraser'];
  const n = parseInt(e.key, 10);
  if (!mod && n >= 1 && n <= tools.length) setTool(tools[n - 1]);
});

window.addEventListener('resize', resizeCanvas);
setTool('pencil');
resizeCanvas();