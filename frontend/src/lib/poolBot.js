/**
 * 台球人机瞄准：采样角度/力度，按难度加噪声；yjz 选最优进球。
 */
import {
  applySerialized,
  createInitialBalls,
  isSolid,
  isStripe,
  resolveShot,
  serializeBalls,
  simulateShot,
  TABLE_H,
  TABLE_W,
} from './poolPhysics.js'

const DIFF = {
  easy: { angleNoise: 0.22, powerNoise: 0.18, missChance: 0.4, samples: 48 },
  normal: { angleNoise: 0.1, powerNoise: 0.1, missChance: 0.15, samples: 90 },
  hard: { angleNoise: 0.035, powerNoise: 0.04, missChance: 0.04, samples: 140 },
  yjz: { angleNoise: 0, powerNoise: 0, missChance: 0, samples: 220, perfect: true },
  yjz_full: { angleNoise: 0, powerNoise: 0, missChance: 0, samples: 260, perfect: true },
}

function clearedGroup(balls, g) {
  if (g === 'solid') return balls.filter((b) => isSolid(b.id)).every((b) => b.pocketed)
  if (g === 'stripe') return balls.filter((b) => isStripe(b.id)).every((b) => b.pocketed)
  return false
}

function targetIds(balls, seat, group, tableOpen) {
  const my = group?.[seat]
  if (tableOpen || !my) {
    return balls.filter((b) => !b.pocketed && b.id !== 0 && b.id !== 8).map((b) => b.id)
  }
  if (clearedGroup(balls, my)) return [8]
  return balls
    .filter((b) => !b.pocketed && (my === 'solid' ? isSolid(b.id) : isStripe(b.id)))
    .map((b) => b.id)
}

function scoreShot(sim, result, balls, targets) {
  let s = 0
  if (result.winner === 'guest') s += 10000
  if (result.winner === 'host') s -= 10000
  if (result.foul) s -= 800
  if (sim.pocketed.includes(0)) s -= 600
  if (sim.pocketed.includes(8) && result.winner !== 'guest') s -= 5000
  for (const id of sim.pocketed) {
    if (targets.includes(id)) s += 400
    else if (id !== 0 && id !== 8) s += 40
  }
  if (result.continueTurn) s += 120
  if (sim.firstHit != null && targets.includes(sim.firstHit)) s += 80
  // 靠近目标球略加分
  const cue = balls.find((b) => b.id === 0)
  if (cue && targets.length) {
    let best = 1e9
    for (const id of targets) {
      const t = balls.find((b) => b.id === id && !b.pocketed)
      if (!t) continue
      best = Math.min(best, Math.hypot(t.x - cue.x, t.y - cue.y))
    }
    s += Math.max(0, 200 - best)
  }
  return s
}

function sampleAngles(balls, targets, n) {
  const cue = balls.find((b) => b.id === 0 && !b.pocketed)
  const angles = []
  if (cue) {
    for (const id of targets) {
      const t = balls.find((b) => b.id === id && !b.pocketed)
      if (!t) continue
      angles.push(Math.atan2(t.y - cue.y, t.x - cue.x))
      // 袋口瞄准：朝球再朝最近袋微调
      for (const [px, py] of [
        [18, 18],
        [TABLE_W / 2, 15],
        [TABLE_W - 18, 18],
        [18, TABLE_H - 18],
        [TABLE_W / 2, TABLE_H - 15],
        [TABLE_W - 18, TABLE_H - 18],
      ]) {
        const gx = t.x + (t.x - px) * 0.02
        const gy = t.y + (t.y - py) * 0.02
        angles.push(Math.atan2(gy - cue.y, gx - cue.x))
      }
    }
  }
  for (let i = 0; i < n; i++) angles.push((Math.PI * 2 * i) / n)
  return angles
}

/**
 * @returns {{ angle: number, power: number }}
 */
export function choosePoolBotShot(ballsSnap, { seat = 'guest', group, tableOpen, difficulty = 'normal' } = {}) {
  const cfg = DIFF[difficulty] || DIFF.normal
  const base = createInitialBalls()
  applySerialized(base, ballsSnap)
  const targets = targetIds(base, seat, group, tableOpen)
  const angles = sampleAngles(base, targets, cfg.perfect ? 36 : 24)
  const powers = cfg.perfect
    ? [0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]
    : [0.3, 0.45, 0.6, 0.75, 0.9]

  let best = { score: -1e12, angle: 0, power: 0.5 }
  let perfect = null
  let tried = 0
  const maxTry = cfg.samples

  outer: for (const angle of angles) {
    for (const power of powers) {
      if (tried++ > maxTry) break outer
      const simBalls = createInitialBalls()
      applySerialized(simBalls, serializeBalls(base))
      const sim = simulateShot(simBalls, angle, power)
      const result = resolveShot({
        pocketed: sim.pocketed,
        firstHit: sim.firstHit,
        seat,
        group: { host: group?.host ?? null, guest: group?.guest ?? null },
        balls: simBalls,
        tableOpen: !!tableOpen,
      })
      const sc = scoreShot(sim, result, base, targets)
      if (sc > best.score) best = { score: sc, angle, power }
      if (cfg.perfect && result.winner === 'guest') {
        perfect = { angle, power }
        break outer
      }
      if (cfg.perfect && result.continueTurn && !result.foul && sim.pocketed.some((id) => targets.includes(id))) {
        perfect = { angle, power }
        // keep searching for win, but remember pot
      }
    }
  }

  let angle = perfect?.angle ?? best.angle
  let power = perfect?.power ?? best.power

  if (!cfg.perfect && Math.random() < cfg.missChance) {
    angle += (Math.random() - 0.5) * 0.9
    power = 0.25 + Math.random() * 0.7
  } else {
    angle += (Math.random() - 0.5) * 2 * cfg.angleNoise
    power = Math.max(0.08, Math.min(1, power + (Math.random() - 0.5) * 2 * cfg.powerNoise))
  }

  return { angle, power }
}
