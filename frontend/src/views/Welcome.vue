<template>
  <main class="welcome" role="main">
    <div class="bg" aria-hidden="true">
      <picture class="bg-pic">
        <source srcset="/welcome/bg.webp" type="image/webp" />
        <img
          class="bg-img"
          src="/welcome/bg.webp"
          alt=""
          width="1920"
          height="1080"
          decoding="async"
          fetchpriority="high"
          @error="onBgError"
        />
      </picture>
      <div class="veil" />
      <div class="grain" />
    </div>
    <SakuraPetals v-if="showPetals" dense :count="12" />

    <div class="stage">
      <h1 class="title">
        <span class="title-line">欢迎来到这里</span>
      </h1>
      <p class="sub">南信大互助平台 · The Greatest NUIST</p>
    </div>

    <nav class="actions" aria-label="入口">
      <RouterLink class="act left" to="/hub">进入平台</RouterLink>
      <RouterLink class="act right" to="/login">登录</RouterLink>
    </nav>
  </main>
</template>

<script setup>
import { defineAsyncComponent, onMounted, ref } from 'vue'

const SakuraPetals = defineAsyncComponent(() => import('../components/SakuraPetals.vue'))

const showPetals = ref(false)

function onBgError(e) {
  // webp 失败时回退 jpg
  if (e?.target && !String(e.target.src).endsWith('.jpg')) {
    e.target.src = '/welcome/bg.jpg'
  }
}

onMounted(() => {
  // 首屏先出图与文字，再补花瓣；并预取平台页 chunk
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  const saveData = navigator.connection?.saveData
  const lite = reduce || saveData
  const kick = () => {
    if (!lite) showPetals.value = true
    // 预取平台页代码，点「进入平台」更快
    import('../views/Hub.vue').catch(() => {})
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(kick, { timeout: 1200 })
  else setTimeout(kick, 500)
})
</script>

<style scoped>
.welcome {
  --ink: #f7f4ef;
  --ink-dim: rgba(247, 244, 239, 0.72);
  --line: rgba(247, 244, 239, 0.55);
  position: relative;
  min-height: 100dvh;
  min-height: 100vh;
  overflow: hidden;
  color: var(--ink);
  isolation: isolate;
}

.bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

.bg-pic {
  position: absolute;
  inset: -4%;
  display: block;
}

.bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  transform-origin: 42% 45%;
  animation: drift 28s ease-in-out infinite alternate;
  will-change: transform;
  background: #05070c;
}

.veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 55% at 50% 38%, rgba(0, 0, 0, 0.18), transparent 70%),
    linear-gradient(180deg, rgba(4, 6, 12, 0.35) 0%, rgba(4, 6, 12, 0.2) 42%, rgba(4, 6, 12, 0.72) 100%);
}

.grain {
  position: absolute;
  inset: 0;
  opacity: 0.07;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: soft-light;
}

.stage {
  position: relative;
  z-index: 1;
  display: grid;
  place-content: center;
  min-height: 100dvh;
  min-height: 100vh;
  padding: 4rem 1.5rem 7.5rem;
  text-align: center;
}

.title {
  margin: 0;
  font-family: var(--display);
  font-weight: 600;
  font-size: clamp(2.4rem, 7vw, 4.2rem);
  letter-spacing: 0.18em;
  line-height: 1.25;
  text-indent: 0.18em;
}

.title-line {
  display: inline-block;
  text-shadow:
    0 2px 24px rgba(0, 0, 0, 0.55),
    0 0 1px rgba(0, 0, 0, 0.8);
  animation: rise-in 1.1s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.sub {
  margin: 1.1rem 0 0;
  font-size: clamp(0.82rem, 2vw, 0.98rem);
  letter-spacing: 0.28em;
  color: var(--ink-dim);
  text-indent: 0.28em;
  animation: rise-in 1.1s cubic-bezier(0.22, 1, 0.36, 1) 0.18s both;
}

.actions {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  padding: clamp(1.25rem, 4vw, 2.4rem) clamp(1.25rem, 5vw, 3rem)
    calc(clamp(1.25rem, 4vw, 2.4rem) + env(safe-area-inset-bottom, 0px));
  pointer-events: none;
}

.act {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 7.5rem;
  padding: 0.85rem 1.35rem;
  border: 1px solid var(--line);
  background: rgba(8, 10, 16, 0.28);
  color: var(--ink);
  text-decoration: none;
  font-size: 1rem;
  letter-spacing: 0.22em;
  text-indent: 0.22em;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition:
    background 0.25s ease,
    border-color 0.25s ease,
    transform 0.25s ease;
  animation: rise-in 1s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both;
}

.act:hover {
  background: rgba(247, 244, 239, 0.14);
  border-color: rgba(247, 244, 239, 0.85);
  transform: translateY(-2px);
}

.act:active {
  transform: translateY(0);
}

.act.left {
  animation-delay: 0.32s;
}

.act.right {
  animation-delay: 0.42s;
}

@keyframes drift {
  from {
    transform: scale(1.04) translate3d(-1.2%, 0.6%, 0);
  }
  to {
    transform: scale(1.1) translate3d(1.4%, -1%, 0);
  }
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 520px) {
  .title {
    letter-spacing: 0.12em;
    text-indent: 0.12em;
  }
  .act {
    min-width: 0;
    flex: 1;
    letter-spacing: 0.14em;
    text-indent: 0.14em;
    padding: 0.9rem 0.75rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bg-img,
  .title-line,
  .sub,
  .act {
    animation: none;
  }
}
</style>
