<template>
  <main class="arcade-page">
    <section class="panel arcade">
      <header class="head">
        <div>
          <h1>小游戏大厅</h1>
          <p class="muted">选游戏开房 · 局内聊天 · 战绩进榜</p>
        </div>
        <RouterLink class="back" to="/hub">← 返回首页</RouterLink>
      </header>

      <p v-if="guestMode" class="guest-tip muted">访客可看排行榜；开房对战请先注册正式账号</p>
      <div class="grid">
        <RouterLink
          class="card pool"
          :to="guestMode ? { name: 'login', query: { redirect: '/arcade/pool', reason: 'guest' } } : '/arcade/pool'"
        >
          <span class="eyebrow">8-Ball</span>
          <strong>台球联机</strong>
          <p>{{ guestMode ? '注册后即可开房对战' : '标准 8 球规则，两人一房。先定方向再定力度。' }}</p>
        </RouterLink>
        <RouterLink
          class="card skull"
          :to="guestMode ? { name: 'login', query: { redirect: '/arcade/skull', reason: 'guest' } } : '/arcade/skull'"
        >
          <span class="eyebrow">Skull</span>
          <strong>骷髅牌</strong>
          <p>{{ guestMode ? '注册后即可开房对战' : '3–6 人心理博弈：放牌、竞标、翻牌，先成功挑战 2 次者胜。' }}</p>
        </RouterLink>
        <RouterLink
          class="card tank"
          :to="guestMode ? { name: 'login', query: { redirect: '/arcade/tank', reason: 'guest' } } : '/arcade/tank'"
        >
          <span class="eyebrow">DDTank</span>
          <strong>坦克弹弹堂</strong>
          <p>
            {{
              guestMode
                ? '注册后即可开房对战'
                : '大混战最多 5 人，或 2v2 团队；看风开火。'
            }}
          </p>
        </RouterLink>
        <RouterLink
          class="card dino"
          :to="guestMode ? { name: 'login', query: { redirect: '/arcade/dino', reason: 'guest' } } : '/arcade/dino'"
        >
          <span class="eyebrow">Dino</span>
          <strong>谷歌小恐龙</strong>
          <p>
            {{
              guestMode
                ? '注册后即可单人畅玩 / 最多五人联机'
                : '单人本地；最多五人一起跑，还有人活着就能救队友。'
            }}
          </p>
        </RouterLink>
        <RouterLink
          class="card curling"
          :to="
            guestMode
              ? { name: 'login', query: { redirect: '/arcade/curling', reason: 'guest' } }
              : '/arcade/curling'
          "
        >
          <span class="eyebrow">Curling</span>
          <strong>冰壶</strong>
          <p>
            {{
              guestMode
                ? '注册后即可开房对战'
                : '1v1 / 混战 / 2v2，调角度力度与旋转，进大本营得分。'
            }}
          </p>
        </RouterLink>
      </div>
    </section>

    <ArcadeLeaderboard class="arcade-board" title="排行榜" :limit="12" />
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ArcadeLeaderboard from '../components/ArcadeLeaderboard.vue'
import { isGuest } from '../api/request'

const guestMode = computed(() => isGuest())
</script>

<style scoped>
.arcade-page {
  display: grid;
  gap: 1rem;
}

.arcade {
  padding: 1.4rem;
  animation: rise 0.4s ease both;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.1rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

.muted {
  margin: 0.4rem 0 0;
}

.back {
  flex-shrink: 0;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--muted);
  text-decoration: none;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.85);
}

.back:hover {
  color: var(--ink);
}

.guest-tip {
  margin: 0 0 0.85rem;
  font-size: 0.9rem;
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  max-width: 440px;
}

@media (min-width: 700px) {
  .grid {
    grid-template-columns: 1fr 1fr;
    max-width: 720px;
  }
}

@media (min-width: 980px) {
  .grid {
    grid-template-columns: 1fr 1fr 1fr;
    max-width: 980px;
  }
}

.card {
  display: block;
  padding: 1.35rem 1.3rem;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  text-decoration: none;
  color: inherit;
  transition: transform 0.18s ease;
}

.pool {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(180, 210, 190, 0.45));
}

.skull {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(220, 180, 180, 0.5));
}

.tank {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(200, 185, 150, 0.55));
}

.dino {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(210, 210, 210, 0.55));
}

.curling {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(180, 210, 230, 0.55));
}

.card:hover {
  transform: translateY(-2px);
}

.eyebrow {
  display: block;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  margin-bottom: 0.4rem;
}

.card strong {
  display: block;
  font-family: var(--display);
  font-size: 1.55rem;
  margin-bottom: 0.4rem;
}

.card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.45;
  font-size: 0.92rem;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
