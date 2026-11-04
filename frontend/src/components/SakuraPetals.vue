<template>
  <div class="sakura" aria-hidden="true">
    <span
      v-for="p in petals"
      :key="p.id"
      class="bloom"
      :class="p.tone"
      :style="p.style"
    >
      <i v-for="n in 5" :key="n" class="petal" :style="{ '--i': n - 1 }" />
      <i class="core" />
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  count: { type: Number, default: 14 },
  dense: { type: Boolean, default: false },
})

const petals = computed(() => {
  const n = props.dense ? Math.max(props.count, 20) : props.count
  return Array.from({ length: n }, (_, i) => {
    const left = ((i * 41 + 7) % 96) + (i % 3)
    const delay = ((i * 1.61) % 14).toFixed(2)
    const dur = (11 + (i % 8) * 1.55).toFixed(2)
    const size = 12 + (i % 6) * 3.2
    const drift = -55 + (i % 11) * 11
    const sway = 18 + (i % 5) * 6
    const spin = 280 + (i % 5) * 140
    const opacity = 0.55 + (i % 4) * 0.1
    const tone = i % 5 === 0 ? 'blush' : i % 3 === 0 ? 'pale' : 'rose'
    return {
      id: i,
      tone,
      style: {
        left: `${left}%`,
        width: `${size}px`,
        height: `${size}px`,
        opacity: String(opacity),
        '--delay': `${delay}s`,
        '--dur': `${dur}s`,
        '--drift': `${drift}px`,
        '--sway': `${sway}px`,
        '--spin': String(spin),
      },
    }
  })
})
</script>

<style scoped>
.sakura {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.bloom {
  position: absolute;
  top: -8%;
  display: block;
  transform-origin: 50% 50%;
  animation: fall-sway var(--dur) linear var(--delay) infinite;
  will-change: transform, opacity;
  filter: drop-shadow(0 4px 6px rgba(180, 90, 120, 0.18));
  pointer-events: none;
}

.petal {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 42%;
  height: 58%;
  margin-left: -21%;
  margin-top: -62%;
  border-radius: 90% 0 55% 45%;
  transform-origin: 50% 100%;
  transform: rotate(calc(var(--i) * 72deg));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
}

.bloom.rose .petal {
  background:
    radial-gradient(circle at 35% 30%, #fff9fc 0%, #ffd0e4 38%, #f2a0c0 78%, #e48aaf 100%);
}

.bloom.pale .petal {
  background:
    radial-gradient(circle at 35% 30%, #ffffff 0%, #ffe9f2 45%, #f7c5d8 100%);
}

.bloom.blush .petal {
  background:
    radial-gradient(circle at 35% 30%, #fff5f8 0%, #ffb6d0 48%, #e891b0 100%);
}

.core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 22%;
  height: 22%;
  margin: -11% 0 0 -11%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 40% 35%, #fff6c8 0%, #f0d27a 55%, #e0b84e 100%);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.45) inset;
}

@keyframes fall-sway {
  0% {
    transform: translate3d(0, -5vh, 0) rotate(0deg) scale(0.85);
    opacity: 0;
  }
  8% {
    opacity: 1;
  }
  25% {
    transform: translate3d(calc(var(--drift) * 0.25 + var(--sway)), 22vh, 0)
      rotate(calc(var(--spin) * 0.22 * 1deg)) scale(1);
  }
  50% {
    transform: translate3d(calc(var(--drift) * 0.55 - var(--sway) * 0.6), 52vh, 0)
      rotate(calc(var(--spin) * 0.52 * 1deg)) scale(1.04);
  }
  75% {
    transform: translate3d(calc(var(--drift) * 0.82 + var(--sway) * 0.35), 82vh, 0)
      rotate(calc(var(--spin) * 0.78 * 1deg)) scale(0.98);
  }
  100% {
    transform: translate3d(var(--drift), 112vh, 0) rotate(calc(var(--spin) * 1deg)) scale(0.88);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bloom {
    display: none;
  }
}

@media (max-width: 700px) {
  .bloom:nth-child(n + 9) {
    display: none;
  }
}
</style>
