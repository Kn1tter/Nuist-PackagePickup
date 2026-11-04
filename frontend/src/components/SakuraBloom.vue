<template>
  <div class="bloom-wrap">
    <button
      type="button"
      class="bloom-btn"
      :disabled="!canBloom"
      :title="hint"
      @click="bloom"
    >
      <SakuraMark size="sm" />
      <span>{{ btnLabel }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'
import SakuraMark from './SakuraMark.vue'

const MAX_PER_DAY = 5
const COOLDOWN_MS = 20_000
const STORM_MS = 12_000
const STORAGE_KEY = 'nuist_sakura_bloom_v2'

const active = ref(false)
const cooldownLeft = ref(0)
const usedToday = ref(readUsed())

let stormTimer = 0
let coolTimer = 0
let coolTick = 0
let overlayEl = null

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readUsed() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (raw.day !== todayKey()) return 0
    return Math.min(MAX_PER_DAY, Number(raw.used) || 0)
  } catch {
    return 0
  }
}

function writeUsed(n) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: todayKey(), used: n }))
}

const left = computed(() => Math.max(0, MAX_PER_DAY - usedToday.value))
const canBloom = computed(() => !active.value && cooldownLeft.value <= 0 && left.value > 0)

const btnLabel = computed(() => {
  if (active.value) return '纷飞中…'
  if (left.value <= 0) return '今日已尽'
  if (cooldownLeft.value > 0) return `稍候 ${cooldownLeft.value}s`
  return `放樱花 · ${left.value}`
})

const hint = computed(() => {
  if (left.value <= 0) return '今日次数已用完，明天再来'
  if (cooldownLeft.value > 0) return '让这一场慢慢落完'
  return `今日还可 ${left.value} 次`
})

function ensureStyles() {
  const old = document.getElementById('nuist-sakura-bloom-css')
  if (old) old.remove()
  if (document.getElementById('nuist-sakura-bloom-css-v3')) return
  const style = document.createElement('style')
  style.id = 'nuist-sakura-bloom-css-v3'
  style.textContent = `
    .nuist-sakura-storm {
      position: fixed;
      inset: 0;
      z-index: 40;
      pointer-events: none !important;
      overflow: hidden;
    }
    .nuist-sakura-storm * {
      pointer-events: none !important;
    }
    .nuist-sakura-mist {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 90% 55% at 50% -5%, rgba(255, 210, 230, 0.55), transparent 68%),
        linear-gradient(180deg, rgba(255, 240, 246, 0.28), transparent 45%, rgba(244, 182, 203, 0.2));
      animation: nuist-sakura-mist 12s ease-in-out forwards;
    }
    .nuist-sakura-flake {
      position: absolute;
      top: -48px;
      width: 22px;
      height: 22px;
      will-change: transform, opacity;
      filter: drop-shadow(0 6px 10px rgba(180, 90, 120, 0.22));
    }
    .nuist-sakura-flake .p {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 42%;
      height: 58%;
      margin: -62% 0 0 -21%;
      border-radius: 90% 0 55% 45%;
      transform-origin: 50% 100%;
      background: radial-gradient(circle at 35% 30%, #fff9fc 0%, #ffd0e4 40%, #e891b0 100%);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.3);
    }
    .nuist-sakura-flake .p:nth-child(1) { transform: rotate(0deg); }
    .nuist-sakura-flake .p:nth-child(2) { transform: rotate(72deg); }
    .nuist-sakura-flake .p:nth-child(3) { transform: rotate(144deg); }
    .nuist-sakura-flake .p:nth-child(4) { transform: rotate(216deg); }
    .nuist-sakura-flake .p:nth-child(5) { transform: rotate(288deg); }
    .nuist-sakura-flake .c {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 22%;
      height: 22%;
      margin: -11% 0 0 -11%;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 35%, #fff6c8, #e8bc4a);
    }
    .nuist-sakura-flake.is-pale .p {
      background: radial-gradient(circle at 35% 30%, #fff 0%, #ffe9f2 50%, #f7c5d8 100%);
    }
    .nuist-sakura-flake.is-blush .p {
      background: radial-gradient(circle at 35% 30%, #fff5f8 0%, #ffb6d0 50%, #e891b0 100%);
    }
    @keyframes nuist-sakura-mist {
      0% { opacity: 0; }
      10% { opacity: 1; }
      75% { opacity: 0.9; }
      100% { opacity: 0; }
    }
  `
  document.head.appendChild(style)
}

function clearOverlay() {
  if (overlayEl) {
    overlayEl.remove()
    overlayEl = null
  }
}

function spawnStorm() {
  ensureStyles()
  clearOverlay()
  const root = document.createElement('div')
  root.className = 'nuist-sakura-storm'
  root.setAttribute('aria-hidden', 'true')

  const mist = document.createElement('div')
  mist.className = 'nuist-sakura-mist'
  root.appendChild(mist)

  const count = 48
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span')
    const size = 16 + (i % 7) * 3.8
    const startX = (i * 47 + (i % 9) * 13) % 100
    const delay = (i % 14) * 0.22 + (i % 4) * 0.08
    const dur = 8.5 + (i % 6) * 0.7
    const sway = 50 + (i % 8) * 14
    const spin = 360 + (i % 5) * 200
    const tone = i % 5 === 0 ? 'is-blush' : i % 3 === 0 ? 'is-pale' : ''
    el.className = `nuist-sakura-flake ${tone}`.trim()
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.style.left = `${startX}vw`
    el.style.opacity = '0'
    for (let n = 0; n < 5; n++) {
      const petal = document.createElement('i')
      petal.className = 'p'
      el.appendChild(petal)
    }
    const core = document.createElement('i')
    core.className = 'c'
    el.appendChild(core)
    el.animate(
      [
        {
          transform: `translate3d(0, -5vh, 0) rotate(0deg) scale(0.7)`,
          opacity: 0,
        },
        {
          transform: `translate3d(${sway * 0.35}px, 22vh, 0) rotate(${spin * 0.2}deg) scale(1)`,
          opacity: 0.92,
          offset: 0.12,
        },
        {
          transform: `translate3d(${-sway * 0.4}px, 48vh, 0) rotate(${spin * 0.5}deg) scale(1.05)`,
          opacity: 0.88,
          offset: 0.45,
        },
        {
          transform: `translate3d(${sway * 0.5}px, 78vh, 0) rotate(${spin * 0.78}deg) scale(1)`,
          opacity: 0.75,
          offset: 0.75,
        },
        {
          transform: `translate3d(${-sway * 0.2}px, 110vh, 0) rotate(${spin}deg) scale(0.85)`,
          opacity: 0,
        },
      ],
      {
        duration: dur * 1000,
        delay: delay * 1000,
        easing: 'cubic-bezier(0.33, 0.12, 0.25, 1)',
        fill: 'forwards',
      }
    )
    root.appendChild(el)
  }

  document.body.appendChild(root)
  overlayEl = root
}

function bloom() {
  if (!canBloom.value) return
  usedToday.value += 1
  writeUsed(usedToday.value)
  active.value = true
  spawnStorm()
  clearTimeout(stormTimer)
  stormTimer = window.setTimeout(() => {
    active.value = false
    clearOverlay()
    startCooldown()
  }, STORM_MS)
}

function startCooldown() {
  cooldownLeft.value = Math.ceil(COOLDOWN_MS / 1000)
  clearInterval(coolTick)
  clearTimeout(coolTimer)
  coolTick = window.setInterval(() => {
    cooldownLeft.value = Math.max(0, cooldownLeft.value - 1)
    if (cooldownLeft.value <= 0) clearInterval(coolTick)
  }, 1000)
  coolTimer = window.setTimeout(() => {
    cooldownLeft.value = 0
    clearInterval(coolTick)
  }, COOLDOWN_MS)
}

onUnmounted(() => {
  clearTimeout(stormTimer)
  clearTimeout(coolTimer)
  clearInterval(coolTick)
  clearOverlay()
})
</script>

<style scoped>
.bloom-wrap {
  display: inline-flex;
  vertical-align: middle;
}

.bloom-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  padding: 0.28rem 0.85rem 0.28rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(232, 145, 176, 0.45);
  background: linear-gradient(135deg, rgba(255, 248, 251, 0.95), rgba(248, 215, 228, 0.75));
  color: #9a4568;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(180, 90, 120, 0.12);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}

.bloom-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(180, 90, 120, 0.2);
}

.bloom-btn:disabled {
  opacity: 0.62;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
</style>
