const RATIO = 16 / 9;
function gestureBounds(start, kind, dx, dy) {
  if (kind === 'move') return { ...start, x: Math.round(start.x + dx), y: Math.round(start.y + dy) };
  const horizontal = /[ew]/.test(kind), vertical = /[ns]/.test(kind);
  let width = horizontal ? start.width + (kind.includes('w') ? -dx : dx) : (start.height + (kind.includes('n') ? -dy : dy)) * RATIO;
  if (horizontal && vertical && Math.abs(dy * RATIO) > Math.abs(dx)) width = (start.height + (kind.includes('n') ? -dy : dy)) * RATIO;
  width = Math.round(Math.max(240, Math.min(5000, width)));
  const height = Math.round(width / RATIO);
  const x = kind.includes('w') ? start.x + start.width - width : horizontal ? start.x : start.x + (start.width - width) / 2;
  const y = kind.includes('n') ? start.y + start.height - height : vertical ? start.y : start.y + (start.height - height) / 2;
  return { x: Math.round(x), y: Math.round(y), width, height };
}
module.exports = { gestureBounds };
