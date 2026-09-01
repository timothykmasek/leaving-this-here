'use client'

import { useEffect, useRef } from 'react'

// The animated dot grid — the DS dot-ground's animated sibling: same 32px
// pitch, same resting grey, but each dot breathes on its own phase and darkens/
// swells near the pointer. It's a canvas because that's per-dot state — the
// tiled-gradient .dot-ground can't do it. Honors prefers-reduced-motion by
// drawing the resting grid once.
//
// Lived inside BetaLanding until 2026-09-01; moved out unchanged so the depth
// hero can share it. Fills its nearest positioned ancestor.

const PITCH = 32
const POINTER_RADIUS = 150

type Dot = { x: number; y: number; phase: number; speed: number }

export function DotGridCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let dots: Dot[] = []
    let w = 0
    let h = 0
    let rafId = 0
    const mouse = { x: -9999, y: -9999 }

    const setup = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      w = parent.clientWidth
      h = parent.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dots = []
      for (let y = PITCH / 2; y < h; y += PITCH) {
        for (let x = PITCH / 2; x < w; x += PITCH) {
          dots.push({ x, y, phase: Math.random() * Math.PI * 2, speed: 0.12 + Math.random() * 0.14 })
        }
      }
    }

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#e3e3e3'
      for (const d of dots) {
        ctx.beginPath()
        ctx.arc(d.x, d.y, 0.85, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const animate = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      const time = t / 1000
      for (const d of dots) {
        const idle = (Math.sin(time * d.speed + d.phase) + 1) / 2
        const dist = Math.hypot(d.x - mouse.x, d.y - mouse.y)
        const p = Math.max(0, 1 - dist / POINTER_RADIUS)
        // Fainter still (2026-09-01, second pass, for the depth hero): base
        // 221→228, idle/pointer swings scaled by ~0.8, floor 80→110, and the
        // dot itself shrinks (1→0.85 base, smaller breath and pointer swell).
        // The whole grid recedes another notch behind the drifting cards.
        const shade = Math.max(110, Math.round(228 - idle * 72 - p * 65))
        ctx.beginPath()
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`
        ctx.arc(d.x, d.y, 0.85 + idle * 0.3 + p * 0.7, 0, Math.PI * 2)
        ctx.fill()
      }
      rafId = requestAnimationFrame(animate)
    }

    const onResize = () => setup()
    const onMove = (e: MouseEvent | TouchEvent) => {
      const r = canvas.getBoundingClientRect()
      const p = 'touches' in e ? e.touches[0] : e
      if (!p) return
      mouse.x = p.clientX - r.left
      mouse.y = p.clientY - r.top
    }

    setup()
    window.addEventListener('resize', onResize)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove)

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) drawStatic()
    else rafId = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
}
