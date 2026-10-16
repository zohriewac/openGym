// Maths of the rep wheel (components/RepWheel.jsx): a strip of equally wide items, the first one
// centred at scrollLeft 0. Kept pure so the rounding and the clamping have a test beside them.
export const REP_WHEEL_MAX = 100

// The value under the centre for a given scroll offset; `step` is the gap between items.
export function valueAtOffset(scrollLeft, itemWidth, min = 0, max = REP_WHEEL_MAX, step = 1) {
  if (!(itemWidth > 0)) return min
  const i = Math.max(0, Math.min(Math.round((scrollLeft || 0) / itemWidth), Math.floor((max - min) / step)))
  return min + i * step
}

// The scroll offset that centres `value` (nearest item when it is off the grid or out of range).
export function offsetOfValue(value, itemWidth, min = 0, max = REP_WHEEL_MAX, step = 1) {
  const i = Math.max(0, Math.min(Math.round(((Number(value) || 0) - min) / step), Math.floor((max - min) / step)))
  return i * itemWidth
}
