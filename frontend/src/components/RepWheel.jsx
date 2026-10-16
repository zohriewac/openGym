import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NumberField } from './ui.jsx'
import Icon from './Icon.jsx'
import { t } from '../lib/i18n.js'
import { tick } from '../lib/sound.js'
import { REP_WHEEL_MAX, valueAtOffset, offsetOfValue } from '../lib/rep-wheel.js'

const ITEM = 44
const LONG_PRESS = 500

// The reps value of a set row. A tap opens a strip of numbers to flick or tap (no keyboard), a
// long press — or the keyboard button in the strip — gives the plain input back. `onChange`
// is the same setter the stepper and the input use.
export default function RepCell({ value, target, step = 1, onChange }) {
  const [open, setOpen] = useState(false)
  const [typing, setTyping] = useState(false)
  const btn = useRef(null)
  const timer = useRef(null)
  const held = useRef(false)
  const shown = value ?? ''
  const close = () => { setOpen(false); btn.current && btn.current.focus() }
  if (typing) return <NumberField decimal={false} value={shown} onChange={onChange} autoFocus onBlur={() => setTyping(false)} />
  return <>
    <button type="button" ref={btn} className="num repbtn" aria-label={`${t('Reps')}: ${shown === '' ? 0 : shown}`}
      aria-haspopup="true" aria-expanded={open}
      onPointerDown={() => { held.current = false; clearTimeout(timer.current); timer.current = setTimeout(() => { held.current = true; setOpen(false); setTyping(true) }, LONG_PRESS) }}
      onPointerUp={() => clearTimeout(timer.current)} onPointerLeave={() => clearTimeout(timer.current)} onPointerCancel={() => clearTimeout(timer.current)}
      onClick={() => { if (!held.current) setOpen(o => !o) }}>{shown}</button>
    {open && <Wheel anchor={btn} value={Number(value) || 0} start={value ? Number(value) : (Number(target) || 0)} step={step}
      onChange={onChange} onClose={close} onType={() => { setOpen(false); setTyping(true) }} />}
  </>
}

function Wheel({ anchor, value, start, step, onChange, onClose, onType }) {
  const box = useRef(null)
  const strip = useRef(null)
  const user = useRef(false) // ignore the scrolls that only put the strip on its starting value
  const settle = useRef(null)
  const last = useRef(start)
  const [mid, setMid] = useState(start)
  const [pos, setPos] = useState(null)
  const max = Math.floor(REP_WHEEL_MAX / step) * step
  const items = []
  for (let v = 0; v <= max; v += step) items.push(v)
  const calm = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useLayoutEffect(() => {
    const r = anchor.current.getBoundingClientRect()
    const w = Math.min(300, window.innerWidth - 16)
    setPos({ width: w, left: Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)), top: Math.max(8, r.top - 64) })
    strip.current.scrollLeft = offsetOfValue(start, ITEM, 0, max, step)
  }, [])
  useEffect(() => {
    const away = e => { if (!box.current.contains(e.target) && !anchor.current.contains(e.target)) onClose() }
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc, true); clearTimeout(settle.current) }
  }, [])
  useEffect(() => {
    const el = strip.current
    const done = () => {
      if (!user.current) return
      const v = valueAtOffset(el.scrollLeft, ITEM, 0, max, step)
      if (v !== value) { tick('commit'); onChange(v) }
    }
    const onScroll = () => {
      if (!user.current) return
      const v = valueAtOffset(el.scrollLeft, ITEM, 0, max, step)
      if (v !== last.current) { last.current = v; setMid(v); tick() }
      // scrollend is not everywhere (Safari < 18); a short quiet spell stands in for it.
      clearTimeout(settle.current); settle.current = setTimeout(done, 140)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', done)
    return () => { el.removeEventListener('scroll', onScroll); el.removeEventListener('scrollend', done) }
  }, [value, max, step])

  const pick = v => {
    clearTimeout(settle.current)
    tick('commit'); onChange(v)
    onClose()
  }
  const key = e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const v = Math.max(0, Math.min(max, mid + d * step))
    user.current = true
    strip.current.scrollLeft = offsetOfValue(v, ITEM, 0, max, step)
    last.current = v; setMid(v); tick()
    clearTimeout(settle.current); settle.current = setTimeout(() => { onChange(v); tick('commit') }, 140)
  }
  return createPortal(
    <div ref={box} className="repwheel" role="group" aria-label={t('Pick reps')} style={pos || { visibility: 'hidden' }} onKeyDown={key}>
      <div ref={strip} className={'repwheel-strip' + (calm ? ' calm' : '')} onPointerDown={() => { user.current = true }} onTouchStart={() => { user.current = true }} onWheel={() => { user.current = true }}>
        {items.map(v => <button key={v} type="button" autoFocus={v === Math.round(start / step) * step} aria-label={String(v)}
          className={'repwheel-i' + (v === mid ? ' on' : Math.abs(v - mid) <= step ? ' near' : '')} onClick={() => pick(v)}>{v}</button>)}
      </div>
      <button type="button" className="repwheel-kb" aria-label={t('Type reps')} onClick={onType}><Icon name="pencil" /></button>
    </div>, document.body)
}
