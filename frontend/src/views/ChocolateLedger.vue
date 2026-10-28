<template>
  <main class="cl-page">
    <div class="atmosphere" aria-hidden="true">
      <div class="glow glow-a" />
      <div class="glow glow-b" />
      <div class="grain" />
    </div>

    <header class="topbar">
      <RouterLink class="back" to="/">南信大互助</RouterLink>
      <span class="ver">v{{ version }}</span>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Chocolate Ledger</p>
        <h1 class="brand">巧克力记账</h1>
        <p class="lede">本地优先的记账 App · 图表、月度对比、智能归类，一键检查更新。</p>
        <div class="cta">
          <a class="btn-dl" :href="apkUrl" target="_blank" rel="noopener">
            下载 APK
          </a>
          <a class="btn-ghost" :href="updateJsonUrl" target="_blank" rel="noopener">
            更新通道
          </a>
        </div>
        <p class="hint">Android · 约 54MB · APK 经 GitHub Release 下载</p>
      </div>

      <div class="hero-visual">
        <img
          class="mascot"
          src="/app/chocolate-mascot.jpg"
          width="720"
          height="720"
          alt="巧克力记账狗狗吉祥物"
        />
        <div class="mascot-ring" aria-hidden="true" />
      </div>
    </section>

    <section class="features" aria-label="功能">
      <h2>做什么</h2>
      <p class="features-lede">短、准、本地。记完就走，数据在你手机里。</p>
      <ul>
        <li v-for="item in features" :key="item.title">
          <strong>{{ item.title }}</strong>
          <span>{{ item.desc }}</span>
        </li>
      </ul>
    </section>

    <footer class="foot">
      <p>巧克力记账 · The Greatest NUIST</p>
      <p class="muted">更新清单：{{ updateJsonUrl }}</p>
    </footer>
  </main>
</template>

<script setup>
import { onMounted } from 'vue'

const version = '1.1.3'
const apkUrl =
  'https://github.com/Kn1tter/Nuist-PackagePickup/releases/download/chocolate-ledger-1.1.3/chocolate-ledger.apk'
const updateJsonUrl = '/app/update.json'

const features = [
  { title: '记账', desc: '快记一笔收支，分类清晰。' },
  { title: '图表', desc: '饼图、折线、柱状多维看花销。' },
  { title: '月度对比', desc: '这个月比上个月多花了多少，一眼知道。' },
  { title: '智能归类', desc: '相近小额支出自动归到习惯类目。' },
  { title: '检查更新', desc: '应用内检测本站 update.json，APK 走 GitHub Release。' },
]

onMounted(() => {
  document.title = '巧克力记账 · The Greatest NUIST'
})
</script>

<style scoped>
.cl-page {
  --cl-ink: #1a100c;
  --cl-muted: #6b5348;
  --cl-cream: #f6ebe3;
  --cl-cocoa: #5c3317;
  --cl-bar: #3b1f12;
  --cl-accent: #c4783b;
  --cl-milk: #fff8f2;
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  color: var(--cl-ink);
  background:
    linear-gradient(165deg, #2a1810 0%, #4a2c1a 42%, #1c120e 100%);
  font-family: 'Noto Serif SC', 'Songti SC', serif;
}

.atmosphere {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.45;
  animation: drift 12s ease-in-out infinite alternate;
}

.glow-a {
  width: min(70vw, 520px);
  height: min(70vw, 520px);
  left: -8%;
  top: -10%;
  background: #a86a3a;
}

.glow-b {
  width: min(55vw, 420px);
  height: min(55vw, 420px);
  right: -6%;
  bottom: 8%;
  background: #6e3d22;
  animation-delay: -4s;
}

.grain {
  position: absolute;
  inset: 0;
  opacity: 0.07;
  background-image: radial-gradient(#fff 0.6px, transparent 0.6px);
  background-size: 3px 3px;
}

.topbar,
.hero,
.features,
.foot {
  position: relative;
  z-index: 1;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.1rem clamp(1.2rem, 4vw, 2.5rem);
  animation: rise 0.6s ease both;
}

.back {
  color: var(--cl-cream);
  opacity: 0.85;
  font-size: 0.92rem;
  letter-spacing: 0.04em;
}

.back:hover {
  opacity: 1;
}

.ver {
  color: var(--cl-accent);
  font-family: Cinzel, 'Noto Serif SC', serif;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
}

.hero {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: clamp(1.5rem, 4vw, 3rem);
  align-items: center;
  min-height: calc(100dvh - 4.5rem);
  padding: 0 clamp(1.2rem, 4vw, 2.5rem) 2.5rem;
}

.hero-copy {
  animation: rise 0.7s 0.08s ease both;
}

.eyebrow {
  margin: 0 0 0.75rem;
  font-family: Cinzel, Georgia, serif;
  font-size: clamp(0.85rem, 1.6vw, 1rem);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--cl-accent);
}

.brand {
  margin: 0;
  font-family: Cinzel, 'Noto Serif SC', serif;
  font-weight: 700;
  font-size: clamp(3.2rem, 11vw, 6.4rem);
  line-height: 0.95;
  letter-spacing: 0.06em;
  color: var(--cl-milk);
  text-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
}

.lede {
  margin: 1.15rem 0 0;
  max-width: 28rem;
  font-size: clamp(1rem, 2.2vw, 1.2rem);
  line-height: 1.65;
  color: rgba(246, 235, 227, 0.86);
}

.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.6rem;
}

.btn-dl,
.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 3rem;
  padding: 0.75rem 1.45rem;
  border-radius: 4px;
  font-weight: 700;
  letter-spacing: 0.06em;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.btn-dl {
  background: linear-gradient(180deg, #e8b57a 0%, var(--cl-accent) 100%);
  color: #24140c;
  box-shadow: 0 14px 36px rgba(196, 120, 59, 0.35);
}

.btn-dl:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 42px rgba(196, 120, 59, 0.45);
}

.btn-ghost {
  border: 1px solid rgba(246, 235, 227, 0.28);
  color: var(--cl-cream);
  background: rgba(255, 248, 242, 0.04);
}

.btn-ghost:hover {
  background: rgba(255, 248, 242, 0.1);
  transform: translateY(-1px);
}

.hint {
  margin: 0.9rem 0 0;
  font-size: 0.86rem;
  color: rgba(246, 235, 227, 0.55);
}

.hero-visual {
  position: relative;
  justify-self: center;
  width: min(100%, 460px);
  aspect-ratio: 1;
  animation: rise 0.85s 0.16s ease both;
}

.mascot {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 2px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  animation: floaty 5.5s ease-in-out infinite;
}

.mascot-ring {
  position: absolute;
  inset: -6%;
  z-index: 1;
  border: 1px solid rgba(232, 181, 122, 0.28);
  border-radius: 4px;
  transform: rotate(2.5deg);
  animation: ring 7s ease-in-out infinite alternate;
}

.features {
  padding: 3.5rem clamp(1.2rem, 4vw, 2.5rem) 2rem;
  background: linear-gradient(180deg, transparent, rgba(12, 8, 6, 0.55));
  animation: rise 0.7s 0.25s ease both;
}

.features h2 {
  margin: 0;
  font-family: Cinzel, 'Noto Serif SC', serif;
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  color: var(--cl-milk);
  letter-spacing: 0.08em;
}

.features-lede {
  margin: 0.55rem 0 1.6rem;
  color: rgba(246, 235, 227, 0.7);
}

.features ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.features li {
  padding: 1.1rem 1rem 1.2rem;
  border-top: 1px solid rgba(232, 181, 122, 0.35);
  background: rgba(255, 248, 242, 0.03);
}

.features strong {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 1.15rem;
  color: var(--cl-cream);
}

.features span {
  color: rgba(246, 235, 227, 0.68);
  line-height: 1.5;
  font-size: 0.95rem;
}

.foot {
  padding: 1.5rem clamp(1.2rem, 4vw, 2.5rem) 2.5rem;
  color: rgba(246, 235, 227, 0.75);
  font-size: 0.9rem;
}

.foot p {
  margin: 0.2rem 0;
}

.foot .muted {
  color: rgba(246, 235, 227, 0.45);
  font-size: 0.8rem;
  word-break: break-all;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes floaty {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes ring {
  from {
    transform: rotate(2.5deg) scale(1);
    opacity: 0.7;
  }
  to {
    transform: rotate(-1.5deg) scale(1.02);
    opacity: 1;
  }
}

@keyframes drift {
  from {
    transform: translate(0, 0);
  }
  to {
    transform: translate(18px, 24px);
  }
}

@media (max-width: 860px) {
  .hero {
    grid-template-columns: 1fr;
    min-height: auto;
    padding-top: 0.5rem;
    padding-bottom: 2rem;
  }

  .hero-visual {
    order: -1;
    width: min(100%, 360px);
  }

  .brand {
    font-size: clamp(2.8rem, 14vw, 4.2rem);
  }
}
</style>
