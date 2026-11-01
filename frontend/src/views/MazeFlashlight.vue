<template>
  <main class="game-page">
    <div class="chrome">
      <RouterLink class="back" to="/">南信大互助</RouterLink>
      <div class="brand-block">
        <p class="eyebrow">Flashlight CS</p>
        <h1>迷宫夜战</h1>
      </div>
      <button class="restart" type="button" @click="restart">重开</button>
    </div>

    <div ref="stageRef" class="stage">
      <canvas
        ref="canvasRef"
        class="board"
        aria-label="迷宫夜战画布"
      />

      <div class="touch" aria-hidden="true">
        <div class="stick-zone">
          <div class="stick-ring" />
          <p>移动</p>
        </div>
        <div class="fire-zone">
          <button
            type="button"
            class="fire"
            @pointerdown.prevent="onFireDown"
            @pointerup.prevent="onFireUp"
            @pointercancel.prevent="onFireUp"
            @pointerleave.prevent="onFireUp"
          >
            开火
          </button>
          <p>瞄准拖拽画面</p>
        </div>
      </div>
    </div>

    <p class="hint">
      桌面：WASD / 方向键移动 · 鼠标瞄准 · 按住射击或空格 · 触屏：左半移动、右半瞄准开火
    </p>
  </main>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { createGame } from '../game/mazeFlashlight'

const canvasRef = ref(null)
const stageRef = ref(null)
let game = null

function onKeyDown(e) {
  game?.key(e.code, true)
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault()
  }
}
function onKeyUp(e) {
  game?.key(e.code, false)
}

function onFireDown(e) {
  e.currentTarget.setPointerCapture?.(e.pointerId)
  game?.setShooting(true)
}
function onFireUp() {
  game?.setShooting(false)
}

function restart() {
  game?.spawn()
}

function fitCanvas() {
  const stage = stageRef.value
  const canvas = canvasRef.value
  if (!stage || !canvas) return
  const w = stage.clientWidth
  const h = Math.max(320, stage.clientHeight)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  game?.resize()
}

onMounted(() => {
  document.title = '迷宫夜战 · Flashlight CS · The Greatest NUIST'
  const canvas = canvasRef.value
  game = createGame(canvas, { cols: 21, rows: 15, cell: 34 })
  canvas.addEventListener('pointerdown', game.onPointerDown)
  canvas.addEventListener('pointermove', game.onPointerMove)
  canvas.addEventListener('pointerup', game.onPointerUp)
  canvas.addEventListener('pointercancel', game.onPointerUp)
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('resize', fitCanvas)
  fitCanvas()
  game.start()
})

onUnmounted(() => {
  const canvas = canvasRef.value
  if (game && canvas) {
    canvas.removeEventListener('pointerdown', game.onPointerDown)
    canvas.removeEventListener('pointermove', game.onPointerMove)
    canvas.removeEventListener('pointerup', game.onPointerUp)
    canvas.removeEventListener('pointercancel', game.onPointerUp)
  }
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('resize', fitCanvas)
  game?.stop()
  game = null
})
</script>

<style scoped>
.game-page {
  --ink: #d7e0ea;
  --muted: #8b9aab;
  --line: rgba(160, 190, 220, 0.16);
  --panel: rgba(10, 14, 20, 0.72);
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  color: var(--ink);
  background:
    radial-gradient(900px 480px at 15% -10%, rgba(48, 72, 96, 0.35), transparent 55%),
    radial-gradient(700px 400px at 90% 0%, rgba(90, 60, 30, 0.18), transparent 50%),
    linear-gradient(180deg, #07090d 0%, #0b1016 45%, #080a0e 100%);
  font-family: 'IBM Plex Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem 0.55rem;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
}

.back {
  color: var(--muted);
  font-size: 0.86rem;
  font-weight: 600;
  border: 1px solid var(--line);
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  background: var(--panel);
}

.brand-block {
  text-align: center;
  flex: 1;
}

.eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #c4a574;
  font-weight: 700;
}

h1 {
  margin: 0.15rem 0 0;
  font-size: clamp(1.35rem, 3.5vw, 1.85rem);
  font-weight: 700;
  letter-spacing: 0.04em;
  font-family: 'IBM Plex Sans', 'PingFang SC', sans-serif;
}

.restart {
  border: 1px solid var(--line);
  background: rgba(70, 110, 150, 0.22);
  color: var(--ink);
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.stage {
  position: relative;
  flex: 1;
  width: min(1100px, calc(100% - 1.2rem));
  margin: 0 auto;
  min-height: min(70vh, 640px);
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  background: #05070a;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}

.board {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}

.touch {
  display: none;
  pointer-events: none;
  position: absolute;
  inset: auto 0 0.75rem 0;
  padding: 0 1rem;
  justify-content: space-between;
  align-items: flex-end;
}

.stick-zone,
.fire-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  color: rgba(180, 200, 220, 0.55);
  font-size: 0.72rem;
}

.stick-ring {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1px dashed rgba(160, 190, 220, 0.28);
  background: rgba(20, 28, 40, 0.25);
}

.fire {
  pointer-events: auto;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1px solid rgba(220, 150, 90, 0.45);
  background: radial-gradient(circle at 40% 35%, rgba(255, 190, 120, 0.35), rgba(40, 24, 12, 0.7));
  color: #f0d2a8;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  touch-action: none;
}

.hint {
  max-width: 1100px;
  width: calc(100% - 1.5rem);
  margin: 0.65rem auto 1rem;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.45;
  text-align: center;
}

@media (max-width: 820px) {
  .touch {
    display: flex;
  }

  .stage {
    min-height: min(62vh, 560px);
  }

  .chrome {
    padding-inline: 0.75rem;
  }
}

@media (hover: none) and (pointer: coarse) {
  .touch {
    display: flex;
  }
}
</style>
