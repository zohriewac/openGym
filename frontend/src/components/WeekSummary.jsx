import { useMemo } from 'react'
import { useStore } from '../store/useStore.js'
import { weekSummary } from '../lib/dashboard.js'
import { fmtNum, fmtVol } from '../lib/format.js'
import { t } from '../lib/i18n.js'

const Stat = ({ label, children }) => <div className="ws-stat"><div className="ws-v">{children}</div><div className="ws-l">{label}</div></div>

// A glance at the week so far; Home mounts it. Nothing to say before the first workout.
export default function WeekSummary() {
  const S = useStore(s => s.S)
  const w = useMemo(() => weekSummary(S), [S.workouts, S.queue, S.week, S.routines, S.weekStart, S.unit])
  if (!S.workouts.length) return null
  const d = w.volumeDelta
  return (
    <section className="week-summary card" aria-label={t('This week')}>
      <h4 className="sec">{t('This week')}</h4>
      <div className="ws-grid">
        <Stat label={t('Sessions')}>{w.sessionsDone}{w.sessionsPlanned > 0 && <span className="ws-of">/{w.sessionsPlanned}</span>}</Stat>
        <Stat label={t('Volume')}>
          {fmtVol(w.volume, S.unit)}
          {d !== null && d !== 0 && <span className={'ws-delta ' + (d > 0 ? 'up' : 'down')}>{d > 0 ? '▲' : '▼'} {Math.round(Math.abs(d) * 100)}%</span>}
        </Stat>
        <Stat label={t('Week streak')}>{fmtNum(w.streak)}</Stat>
        <Stat label={t('PRs')}>{fmtNum(w.prsThisWeek)}</Stat>
      </div>
    </section>
  )
}
