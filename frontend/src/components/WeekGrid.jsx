const CELL = 10, GAP = 3

// Consistency grid: one column per week, one row per weekday, days oldest first.
export default function WeekGrid({ days, label }) {
  const cols = Math.ceil(days.length / 7), step = CELL + GAP
  return <svg className="weekgrid" width="100%" viewBox={`0 0 ${cols * step - GAP} ${7 * step - GAP}`} role="img" aria-label={label}>
    {days.map(({ iso, n }, i) => <rect key={iso} x={Math.floor(i / 7) * step} y={(i % 7) * step} width={CELL} height={CELL} rx="2" className={n ? 'on' : 'off'}><title>{iso}</title></rect>)}
  </svg>
}
