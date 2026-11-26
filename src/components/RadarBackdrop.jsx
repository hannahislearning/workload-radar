
import { useEffect, useRef } from 'react'

const TAU = Math.PI * 2
const GRID = 9
const glints = ['#24503b', '#367557', '#4c9270']

function draw(ctx, width, height, time, cursor) {
  ctx.clearRect(0, 0, width, height)
  const radius = Math.min(39, width * 0.13)
  const waveHeight = Math.min(98, height * .14)

  for (let x = 0; x < width; x += GRID) {
    const u = x / width
    const column = Math.floor(x / (GRID * 4))
    const step = Math.sin(column * 2.39) * 13
    const phase = u * TAU * 1.24 - time * .88
    const first = height * .31 + waveHeight * Math.sin(phase) + step
    const second = height * .77 + waveHeight * Math.sin(phase * .78 + 2.6) - step
    for (let y = 0; y < height; y += GRID) {
      const d = Math.hypot(x - cursor.x, y - cursor.y)
      const pull = Math.max(0, 1 - d / radius) * cursor.weight
      // Quantized rows keep the distortion pixel-shaped as the wave bends.
      const lift = Math.round(pull * (cursor.y - (y < height / 2 ? first : second)) * .44 / GRID) * GRID
      const distance = Math.min(Math.abs(y - first - lift), Math.abs(y - second - lift))
      const ribbon = Math.max(0, 1 - distance / (62 + pull * 23))
      const flicker = (Math.sin(x * .082 + y * .17 + time * 1.4) + 1) / 2
      const density = ribbon * (.28 + flicker * .49)
      if (density >= .2) {
        const level = Math.min(2, Math.floor(density * glints.length))
        ctx.fillStyle = glints[level]
        ctx.globalAlpha = .12 + density * .47
        ctx.fillRect(x, y, 2 + level, 2)
      }
      if (pull > .09) {
        const light = pull ** 1.35
        ctx.fillStyle = pull > .48 ? '#d2fbd4' : '#78d69b'
        ctx.globalAlpha = Math.min(.98, light * 1.16)
        const size = 2 + Math.round(pull * 3)
        ctx.fillRect(x, y, size, size)
      }
    }
  }
  ctx.globalAlpha = 1
}

export default function RadarBackdrop({ paused }) {
  const canvas = useRef(null)
  useEffect(() => {
    const element = canvas.current
    const context = element.getContext('2d')
    if (!context) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const target = { x: 0, y: 0, weight: 0 }
    const cursor = { ...target }
    let frame = 0, last = 0, width = 0, height = 0, time = 0
    const canMove = () => !paused && !preference.matches && !document.hidden
    function paint() { draw(context, width, height, time, cursor) }
    function tick(now) {
      if (!canMove()) return
      if (!last || now - last >= 32) {
        if (last) time += Math.min(now - last, 64) / 1000
        last = now
        cursor.x += (target.x - cursor.x) * .19
        cursor.y += (target.y - cursor.y) * .19
        cursor.weight += (target.weight - cursor.weight) * .17
        paint()
      }
      frame = requestAnimationFrame(tick)
    }
    function restart() {
      cancelAnimationFrame(frame)
      last = 0
      if (canMove()) frame = requestAnimationFrame(tick)
      else paint()
    }
    function resize() {
      width = element.clientWidth
      height = element.clientHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      paint()
    }
    function point(event) {
      if (!canMove()) return
      target.x = event.clientX
      target.y = event.clientY
      if (!target.weight && cursor.weight < .03) {
        cursor.x = target.x
        cursor.y = target.y
      }
      target.weight = 1
    }
    function release() { target.weight = 0 }
    function leave(event) { if (!event.relatedTarget) release() }
    resize()
    restart()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', point, { passive: true })
    window.addEventListener('pointerdown', point, { passive: true })
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('pointerout', leave)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', restart)
    preference.addEventListener('change', restart)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', point)
      window.removeEventListener('pointerdown', point)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('pointerout', leave)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', restart)
      preference.removeEventListener('change', restart)
    }
  }, [paused])
  return <div className="radar-atmosphere" aria-hidden="true"><canvas ref={canvas}/></div>
}
