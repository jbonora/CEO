import React, { useEffect, useRef, useState } from 'react'

export default function App() {
  const canvasRef = useRef(null)

  const [wind, setWind] = useState(0)
  const [oxygen, setOxygen] = useState(0.85)
  const [wickHeight, setWickHeight] = useState(0.7)
  const [turbulence, setTurbulence] = useState(0.45)
  const [burning, setBurning] = useState(true)
  const [stats, setStats] = useState({ particles: 0, temp: 0 })

  const paramsRef = useRef({
    wind: 0,
    oxygen: 0.85,
    wickHeight: 0.7,
    turbulence: 0.45,
    burning: true,
    gust: 0,
  })

  useEffect(() => {
    paramsRef.current.wind = wind
    paramsRef.current.oxygen = oxygen
    paramsRef.current.wickHeight = wickHeight
    paramsRef.current.turbulence = turbulence
    paramsRef.current.burning = burning
  }, [wind, oxygen, wickHeight, turbulence, burning])

  const applyGust = () => {
    const dir = paramsRef.current.wind !== 0
      ? Math.sign(paramsRef.current.wind)
      : (Math.random() < 0.5 ? -1 : 1)
    paramsRef.current.gust = dir * (0.8 + Math.random() * 0.6)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const MAX_PARTICLES = 700
    const MAX_SMOKE = 250
    const particles = []
    const smoke = []

    let lastT = performance.now()
    let noiseT = 0
    const seedA = Math.random() * 1000
    const seedB = Math.random() * 1000

    const noise = (x) =>
      Math.sin(x * 1.3) * 0.55 +
      Math.sin(x * 2.7 + 1.3) * 0.3 +
      Math.sin(x * 5.1 + 4.2) * 0.15

    const colorFromTemp = (t) => {
      t = t < 0 ? 0 : t > 1 ? 1 : t
      if (t < 0.15) {
        const g = 30 + t * 250
        return [g, g * 0.85, g * 0.7]
      } else if (t < 0.4) {
        const k = (t - 0.15) / 0.25
        return [180 + k * 70, 30 + k * 70, 20 + k * 30]
      } else if (t < 0.65) {
        const k = (t - 0.4) / 0.25
        return [250, 100 + k * 110, 50 + k * 30]
      } else if (t < 0.88) {
        const k = (t - 0.65) / 0.23
        return [255, 210 + k * 45, 90 + k * 110]
      } else {
        const k = (t - 0.88) / 0.12
        return [240 - k * 70, 240 - k * 40, 190 + k * 65]
      }
    }

    const emit = (cx, cy, p, dt) => {
      const intensity = p.oxygen * (0.55 + p.wickHeight * 0.7)
      const count = intensity * 110 * dt
      const whole = Math.floor(count) + (Math.random() < (count % 1) ? 1 : 0)
      for (let i = 0; i < whole; i++) {
        if (particles.length >= MAX_PARTICLES) break
        const spread = 1.6 + p.wickHeight * 1.4
        const offsetX = (Math.random() - 0.5) * spread
        const offsetY = (Math.random() - 0.2) * 2
        particles.push({
          x: cx + offsetX,
          y: cy + offsetY,
          vx: (Math.random() - 0.5) * 8,
          vy: -(8 + Math.random() * 14),
          life: 0,
          maxLife: 0.9 + Math.random() * 0.7 + p.wickHeight * 0.3,
          radius: 3 + Math.random() * 4,
          temp: 0.86 + Math.random() * 0.14,
          seed: Math.random() * 1000,
        })
      }
    }

    let rafId

    const step = () => {
      const now = performance.now()
      let dt = (now - lastT) / 1000
      if (dt > 0.05) dt = 0.05
      lastT = now
      noiseT += dt

      const p = paramsRef.current
      p.gust *= Math.pow(0.18, dt)

      const candleWidth = Math.min(80, w * 0.11)
      const candleBottom = h - 24
      const candleTop = Math.min(h * 0.6, candleBottom - 180)
      const wickBaseX = w / 2
      const wickBaseY = candleTop
      const wickLen = 18 * p.wickHeight
      const wickTipX = wickBaseX
      const wickTipY = wickBaseY - wickLen

      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, '#0a0612')
      bg.addColorStop(0.6, '#050308')
      bg.addColorStop(1, '#000000')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      const flicker = noise(noiseT * 2.4 + seedA)
      const slowFlicker = noise(noiseT * 0.7 + seedB)
      const glowAlpha = p.burning
        ? Math.max(0, p.oxygen) * (0.28 + flicker * 0.06 + slowFlicker * 0.04)
        : 0

      if (glowAlpha > 0) {
        const ambient = ctx.createRadialGradient(
          wickTipX, wickTipY, 8,
          wickTipX, wickTipY, 320
        )
        ambient.addColorStop(0, `rgba(255, 170, 70, ${glowAlpha})`)
        ambient.addColorStop(0.5, `rgba(255, 110, 40, ${glowAlpha * 0.35})`)
        ambient.addColorStop(1, 'rgba(255, 80, 20, 0)')
        ctx.fillStyle = ambient
        ctx.fillRect(0, 0, w, h)
      }

      const cx0 = wickBaseX - candleWidth / 2
      const cx1 = wickBaseX + candleWidth / 2
      const candleGrad = ctx.createLinearGradient(cx0, 0, cx1, 0)
      candleGrad.addColorStop(0, '#2a1d12')
      candleGrad.addColorStop(0.25, '#a8916e')
      candleGrad.addColorStop(0.5, '#efdfbf')
      candleGrad.addColorStop(0.75, '#9c8460')
      candleGrad.addColorStop(1, '#1d130a')
      ctx.fillStyle = candleGrad
      ctx.fillRect(cx0, candleTop, candleWidth, candleBottom - candleTop)

      ctx.fillStyle = 'rgba(255, 230, 190, 0.5)'
      ctx.beginPath()
      ctx.ellipse(cx0 + candleWidth * 0.18, candleTop + 30, 4, 12, 0, 0, Math.PI * 2)
      ctx.ellipse(cx1 - candleWidth * 0.22, candleTop + 50, 3, 18, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#1b1209'
      ctx.beginPath()
      ctx.ellipse(wickBaseX, candleTop, candleWidth / 2, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#6b4f30'
      ctx.beginPath()
      ctx.ellipse(wickBaseX, candleTop + 1.5, candleWidth / 2 - 4, 4.5, 0, 0, Math.PI * 2)
      ctx.fill()

      if (p.burning && p.oxygen > 0.1) {
        ctx.globalCompositeOperation = 'lighter'
        const pool = ctx.createRadialGradient(wickBaseX, candleTop + 1, 1, wickBaseX, candleTop + 1, candleWidth / 2)
        pool.addColorStop(0, 'rgba(255, 160, 60, 0.45)')
        pool.addColorStop(1, 'rgba(255, 80, 20, 0)')
        ctx.fillStyle = pool
        ctx.beginPath()
        ctx.ellipse(wickBaseX, candleTop + 1, candleWidth / 2 - 4, 4, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
      }

      const wickCurl = (p.wind + p.gust) * 3
      ctx.strokeStyle = p.burning ? '#15100a' : '#3a2c1d'
      ctx.lineWidth = 2.6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(wickBaseX, candleTop)
      ctx.quadraticCurveTo(
        wickBaseX + wickCurl * 0.3,
        (candleTop + wickTipY) / 2,
        wickTipX + wickCurl,
        wickTipY
      )
      ctx.stroke()

      if (p.burning && p.oxygen > 0.05) {
        emit(wickTipX + wickCurl * 0.5, wickTipY, p, dt)
      }

      const haloSize = (38 + p.wickHeight * 50) * (0.85 + flicker * 0.12 + p.oxygen * 0.25)
      if (p.burning && p.oxygen > 0.05) {
        ctx.globalCompositeOperation = 'lighter'
        const lean = (p.wind + p.gust) * 22
        const halo = ctx.createRadialGradient(
          wickTipX + lean * 0.5,
          wickTipY - 14 - p.wickHeight * 12,
          2,
          wickTipX + lean,
          wickTipY - 14 - p.wickHeight * 12,
          haloSize
        )
        const haloI = Math.min(1, p.oxygen * 1.15)
        halo.addColorStop(0, `rgba(255, 230, 170, ${0.65 * haloI})`)
        halo.addColorStop(0.35, `rgba(255, 140, 50, ${0.35 * haloI})`)
        halo.addColorStop(1, 'rgba(255, 80, 20, 0)')
        ctx.fillStyle = halo
        ctx.fillRect(0, 0, w, h)
        ctx.globalCompositeOperation = 'source-over'
      }

      ctx.globalCompositeOperation = 'lighter'
      let avgTemp = 0
      let aliveCount = 0

      for (let i = particles.length - 1; i >= 0; i--) {
        const pp = particles[i]
        pp.life += dt

        const buoyancy = -240 * pp.temp * (0.55 + p.oxygen * 0.55)
        const drag = 1.5
        const windForce = (p.wind * 110 + p.gust * 180) * (0.4 + pp.life * 0.9)
        const tn1 = noise(pp.seed + noiseT * 3.2 + pp.y * 0.025)
        const tn2 = noise(pp.seed + 30 + noiseT * 2.6 + pp.x * 0.025)
        const turbStrength = (40 + p.turbulence * 160) * (0.4 + pp.life * 1.2)
        const turbX = tn1 * turbStrength
        const turbY = tn2 * turbStrength * 0.35

        pp.vx += (windForce + turbX - pp.vx * drag) * dt
        pp.vy += (buoyancy + turbY - pp.vy * drag) * dt

        pp.x += pp.vx * dt
        pp.y += pp.vy * dt

        const coolRate = 0.6 / (0.25 + p.oxygen)
        pp.temp -= coolRate * dt
        pp.radius += dt * (6 + p.turbulence * 6)

        if (pp.life > pp.maxLife || pp.temp <= 0.02 || pp.y < -30 || pp.x < -50 || pp.x > w + 50) {
          if (pp.temp < 0.18 && pp.y > -20 && smoke.length < MAX_SMOKE) {
            smoke.push({
              x: pp.x,
              y: pp.y,
              vx: pp.vx * 0.3,
              vy: pp.vy * 0.5,
              life: 0,
              maxLife: 2.2 + Math.random() * 2,
              radius: pp.radius * 0.9,
              alpha: 0.18,
              seed: Math.random() * 1000,
            })
          }
          particles.splice(i, 1)
          continue
        }

        avgTemp += pp.temp
        aliveCount++

        const [r, g, b] = colorFromTemp(pp.temp)
        const a = pp.temp * 0.85
        const grad = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, pp.radius)
        grad.addColorStop(0, `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`)
        grad.addColorStop(1, `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(pp.x, pp.y, pp.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      if (p.burning && p.oxygen > 0.05) {
        const tipGlow = ctx.createRadialGradient(
          wickTipX + wickCurl,
          wickTipY,
          0,
          wickTipX + wickCurl,
          wickTipY,
          14
        )
        tipGlow.addColorStop(0, 'rgba(255, 230, 170, 0.95)')
        tipGlow.addColorStop(1, 'rgba(255, 120, 40, 0)')
        ctx.fillStyle = tipGlow
        ctx.beginPath()
        ctx.arc(wickTipX + wickCurl, wickTipY, 14, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'source-over'

      for (let i = smoke.length - 1; i >= 0; i--) {
        const s = smoke[i]
        s.life += dt
        s.vy -= 22 * dt
        const sn = noise(s.seed + noiseT * 1.4)
        s.vx += (sn * 35 + p.wind * 60 + p.gust * 90) * dt
        s.vx *= Math.pow(0.45, dt)
        s.vy *= Math.pow(0.7, dt)
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.radius += dt * 10
        if (s.life > s.maxLife) {
          smoke.splice(i, 1)
          continue
        }
        const t = s.life / s.maxLife
        const alpha = s.alpha * (1 - t)
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius)
        grad.addColorStop(0, `rgba(90, 90, 95, ${alpha})`)
        grad.addColorStop(1, `rgba(40, 40, 45, 0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
        ctx.fill()
      }

      if (Math.random() < 0.06) {
        setStats({
          particles: aliveCount,
          temp: aliveCount ? avgTemp / aliveCount : 0,
        })
      }

      rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="min-h-screen bg-black text-gray-200">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <header className="mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-orange-300">
            Simulador de llama de vela
          </h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl">
            Combustión simplificada del pábilo: emisión de gases calientes, flotabilidad
            por gradiente térmico, enfriamiento por convección y campo de aire con viento,
            ráfagas y turbulencia (ruido suave).
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          <div className="relative rounded-lg overflow-hidden border border-gray-800 bg-black aspect-[4/3] lg:aspect-auto lg:h-[640px]">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          </div>

          <aside className="space-y-4 bg-gray-900/60 rounded-lg p-4 border border-gray-800">
            <button
              onClick={() => setBurning((b) => !b)}
              className={`w-full py-2.5 rounded-md font-semibold transition ${
                burning
                  ? 'bg-orange-600 hover:bg-orange-500 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
              }`}
            >
              {burning ? 'Apagar mecha' : 'Encender mecha'}
            </button>

            <Slider
              label="Viento horizontal"
              value={wind}
              min={-1}
              max={1}
              step={0.01}
              onChange={setWind}
              hint={
                Math.abs(wind) < 0.02
                  ? 'sin viento'
                  : wind > 0
                  ? `→ ${(wind * 100) | 0}%`
                  : `← ${(-wind * 100) | 0}%`
              }
            />

            <Slider
              label="Oxígeno disponible"
              value={oxygen}
              min={0}
              max={1}
              step={0.01}
              onChange={setOxygen}
              hint={`${(oxygen * 100) | 0}%`}
            />

            <Slider
              label="Longitud de mecha"
              value={wickHeight}
              min={0.3}
              max={1.5}
              step={0.01}
              onChange={setWickHeight}
              hint={`${wickHeight.toFixed(2)}×`}
            />

            <Slider
              label="Turbulencia del aire"
              value={turbulence}
              min={0}
              max={1}
              step={0.01}
              onChange={setTurbulence}
              hint={`${(turbulence * 100) | 0}%`}
            />

            <button
              onClick={applyGust}
              className="w-full py-2 rounded-md bg-sky-700 hover:bg-sky-600 font-semibold"
            >
              Soplar (ráfaga)
            </button>

            <div className="text-xs text-gray-400 border-t border-gray-800 pt-3 space-y-1">
              <Stat label="Partículas activas" value={stats.particles} />
              <Stat
                label="Temp. media estimada"
                value={`${(stats.temp * 1800) | 0} K`}
              />
              <p className="pt-3 text-[11px] leading-relaxed text-gray-500">
                La cera vaporizada arde con O₂; los gases calientes se elevan por
                flotabilidad (ρ baja con T), se enfrían y forman humo gris. Reducir
                oxígeno apaga la combustión; el viento y la turbulencia inclinan y
                quiebran el penacho.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, hint }) {
  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-500 font-mono">{hint}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-orange-500"
      />
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-gray-200 font-mono">{value}</span>
    </div>
  )
}
