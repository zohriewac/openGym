// Weekly goal ring. The arc is left out at 0 so a round cap doesn't draw a dot.
export default function Ring({ value, max, size = 64, stroke = 7, label }) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r
  const p = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="ring">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
    {p > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--acc)" strokeWidth={stroke} strokeLinecap="round"
      strokeDasharray={C} strokeDashoffset={C * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
  </svg>
}
