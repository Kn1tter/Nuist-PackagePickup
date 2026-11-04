<template>
  <svg
    class="mark"
    :class="{ sm: size === 'sm', lg: size === 'lg' }"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <radialGradient :id="gid + '-p'" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stop-color="#fff8fb" />
        <stop offset="45%" stop-color="#ffd0e4" />
        <stop offset="100%" stop-color="#e891b0" />
      </radialGradient>
      <radialGradient :id="gid + '-c'" cx="40%" cy="35%" r="70%">
        <stop offset="0%" stop-color="#fff4c2" />
        <stop offset="100%" stop-color="#e8bc4a" />
      </radialGradient>
    </defs>
    <g class="bloom">
      <path
        v-for="i in 5"
        :key="i"
        class="leaf"
        :fill="`url(#${gid}-p)`"
        :transform="`rotate(${(i - 1) * 72} 32 32)`"
        d="M32 8c5.2 5.4 7.4 11.8 6.2 17.6-3.6-1.5-7-2.2-10.2-2.2s-6.6.7-10.2 2.2C20.6 19.8 23.2 13.4 32 8Z"
      />
      <circle cx="32" cy="32" r="5.6" :fill="`url(#${gid}-c)`" />
      <circle cx="30.5" cy="30.8" r="1.4" fill="rgba(255,255,255,0.65)" />
    </g>
  </svg>
</template>

<script setup>
let _uid = 0
defineProps({
  size: { type: String, default: 'md' },
})
const gid = `sk-${++_uid}`
</script>

<style scoped>
.mark {
  width: 1.35rem;
  height: 1.35rem;
  display: inline-block;
  vertical-align: -0.18em;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 2px rgba(180, 90, 120, 0.25));
}

.mark.sm {
  width: 1rem;
  height: 1rem;
}

.mark.lg {
  width: 1.85rem;
  height: 1.85rem;
}

.leaf {
  opacity: 0.96;
}

.bloom {
  transform-origin: 32px 32px;
  animation: spin 22s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bloom {
    animation: none;
  }
}
</style>
