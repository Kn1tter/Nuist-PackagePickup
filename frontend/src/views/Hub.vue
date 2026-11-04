<template>
  <main class="hub">
    <section class="intro">
      <div>
        <div class="season-row">
          <p class="season" :data-season="seasonKey">
            <SakuraMark />
            <span>{{ seasonLabel }}</span>
          </p>
          <SakuraBloom />
        </div>
        <h1>南信大互助平台</h1>
        <p class="muted">论坛 · 更新 · 代拿 · 资源库 · 开黑 · 小游戏 · 课表 · 学习通 · 视频 · 历史上的今天 · The Greatest NUIST</p>
      </div>
      <a
        class="contact muted"
        href="https://wpa.qq.com/msgrd?v=3&uin=1440205803&site=qq&menu=yes"
        target="_blank"
        rel="noopener noreferrer"
        title="点击联系 QQ"
      >
        联系 QQ：1440205803
      </a>
    </section>

    <section class="today" aria-label="历史上的今天">
      <header class="today-head">
        <div>
          <p class="today-eyebrow">On This Day</p>
          <h2>历史上的今天</h2>
        </div>
        <div class="today-clock" aria-live="polite">
          <time :datetime="clockIso">{{ clockText }}</time>
          <span class="today-date">{{ liveDateLabel }} {{ liveWeekday }}</span>
        </div>
      </header>

      <p class="today-fest">
        <template v-if="festLine">今日：{{ festLine }}</template>
        <template v-else-if="metaReady">今日暂无特别节日</template>
        <span v-if="lunarShort" class="muted today-lunar"> · 农历{{ lunarShort }}</span>
      </p>
      <p v-if="countdownText" class="today-countdown">
        <span class="cd-label">倒计时</span>
        <strong>{{ countdownText }}</strong>
        <span v-if="nextFest?.dateLabel && nextFest.daysLeft !== 0" class="muted cd-date">
          · {{ nextFest.dateLabel }}
        </span>
      </p>

      <ul v-if="previewNewest.length" class="today-events">
        <li v-for="(ev, i) in previewNewest" :key="'n-' + i">
          <span class="ev-year">{{ ev.year ? `${ev.year}年` : '同年' }}</span>
          <span class="ev-text">{{ ev.text }}</span>
        </li>
      </ul>
      <p v-if="previewNewest.length && previewOldest.length" class="today-gap muted" aria-hidden="true">
        · · ·
      </p>
      <ul v-if="previewOldest.length" class="today-events">
        <li v-for="(ev, i) in previewOldest" :key="'o-' + i">
          <span class="ev-year">{{ ev.year ? `${ev.year}年` : '同年' }}</span>
          <span class="ev-text">{{ ev.text }}</span>
        </li>
      </ul>
      <p v-else-if="todayError" class="err today-err">{{ todayError }}</p>
      <p v-else-if="todayLoading" class="muted today-empty">历史事件加载中…</p>
      <p v-else-if="!previewNewest.length" class="muted today-empty">暂无历史条目，稍后再试。</p>
      <RouterLink class="today-more" to="/history-today">查看完整时间线 →</RouterLink>
    </section>

    <div class="branch" aria-hidden="true">
      <svg viewBox="0 0 640 72" preserveAspectRatio="none">
        <path
          class="twig"
          d="M8 48 C120 18, 220 62, 320 34 S520 10, 632 42"
        />
        <g v-for="b in blooms" :key="b.x" :transform="`translate(${b.x} ${b.y}) scale(${b.s})`">
          <circle r="5.5" fill="#f4b6cb" opacity="0.9" />
          <circle r="2.2" fill="#f0d27a" />
        </g>
      </svg>
    </div>

    <div class="entries">
      <RouterLink class="entry forum" to="/forum">
        <span class="eyebrow">Campus Talk</span>
        <strong>校园论坛</strong>
        <p>吐槽、求助、反馈校园生活，和同学一起把南信大变好一点。</p>
      </RouterLink>

      <RouterLink class="entry changelog" to="/changelog">
        <span class="eyebrow">Changelog</span>
        <strong>更新日志</strong>
        <p>查看网站功能更新与修复记录；仅管理员可发布。</p>
      </RouterLink>

      <RouterLink class="entry pickup" to="/pickup">
        <span class="eyebrow">Package Pickup</span>
        <strong>代拿快递</strong>
        <p>发单、接单、线下结算；取件码仅接单后可见。</p>
      </RouterLink>

      <RouterLink class="entry resources" to="/resources">
        <span class="eyebrow">Resource Hub</span>
        <strong>资源库</strong>
        <p>课件、历年卷、软件与学习资料链接，分类浏览、一键打开。</p>
      </RouterLink>

      <RouterLink class="entry games" to="/games">
        <span class="eyebrow">Party Up</span>
        <strong>校内开黑</strong>
        <p>自建游戏组，加入后发开黑邀请，找南信大的搭子。</p>
      </RouterLink>

      <RouterLink class="entry arcade" to="/arcade">
        <span class="eyebrow">Arcade</span>
        <strong>小游戏</strong>
        <p>台球、骷髅牌、坦克、冰壶、小恐龙；开房联机，战绩上榜。</p>
      </RouterLink>

      <RouterLink class="entry schedule" to="/schedule">
        <span class="eyebrow">Timetable</span>
        <strong>我的课表</strong>
        <p>录入课表后按日生成网页悬浮窗，一眼看到时间、课程与楼号。</p>
      </RouterLink>

      <RouterLink class="entry homework" to="/homework">
        <span class="eyebrow">Chaoxing</span>
        <strong>学习通作业</strong>
        <p>绑定账号后查看提交状态与截止时间，临近截止可站内信 / Bark 提醒。</p>
      </RouterLink>

      <RouterLink class="entry video" to="/video">
        <span class="eyebrow">Video Parse</span>
        <strong>视频解析</strong>
        <p>视频分享链接，或 LinkSwift 复制的网盘直链。解析后由本机下载，服务器不保留文件。</p>
      </RouterLink>

      <RouterLink class="entry history" to="/history-today">
        <span class="eyebrow">On This Day</span>
        <strong>历史上的今天</strong>
        <p>完整时间线：古今大事按年份排列，英文条目自动汉化。</p>
      </RouterLink>

      <RouterLink class="entry chocolate" to="/app">
        <span class="eyebrow">Chocolate Ledger</span>
        <strong>巧克力记账</strong>
        <p>本地记账、图表与月度对比；下载 APK，更新走本站通道。</p>
      </RouterLink>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import SakuraBloom from '../components/SakuraBloom.vue'
import SakuraMark from '../components/SakuraMark.vue'
import { request } from '../api/request'

const blooms = [
  { x: 70, y: 36, s: 0.9 },
  { x: 150, y: 28, s: 1.1 },
  { x: 230, y: 46, s: 0.85 },
  { x: 320, y: 30, s: 1.15 },
  { x: 410, y: 40, s: 0.95 },
  { x: 500, y: 22, s: 1.05 },
  { x: 580, y: 38, s: 0.88 },
]

const SHANGHAI = 'Asia/Shanghai'
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const today = ref(null)
const todayMeta = ref(null)
const todayLoading = ref(true)
const todayError = ref('')
const metaReady = ref(false)
const clockText = ref('')
const clockIso = ref('')
const liveDateKey = ref('')
const liveDateLabel = ref('')
const liveWeekday = ref('')
const seasonKey = ref('autumn')
const seasonLabel = ref('')
const countdownText = ref('')
let clockTimer = 0
let loadedDateKey = ''
let loadingLock = false

function shanghaiPartsNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t)?.value || ''
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const noon = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00+08:00`
  )
  return {
    year,
    month,
    day,
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    dateLabel: `${year}年${month}月${day}日`,
    weekday: `星期${WEEKDAYS[noon.getUTCDay()]}`,
  }
}

function refreshSeason(month) {
  // 按北京时间月份：春3–5 夏6–8 秋9–11 冬12–2
  if (month >= 3 && month <= 5) {
    seasonKey.value = 'spring'
    seasonLabel.value = '春日在线 · 樱花季'
  } else if (month >= 6 && month <= 8) {
    seasonKey.value = 'summer'
    seasonLabel.value = '夏日在线 · 蝉鸣时节'
  } else if (month >= 9 && month <= 11) {
    seasonKey.value = 'autumn'
    seasonLabel.value = '秋日在线 · 金风时节'
  } else {
    seasonKey.value = 'winter'
    seasonLabel.value = '冬日在线 · 岁寒时节'
  }
}

const festSource = computed(() => todayMeta.value || today.value)

const festLine = computed(() => {
  const list = festSource.value?.festivals
  if (!Array.isArray(list) || !list.length) {
    const jq = festSource.value?.jieQi
    return jq === '清明' ? '清明' : ''
  }
  return list.join(' · ')
})

/** 农历文案去掉年份，只留「九月十八」这类月日，避免看成公历 */
const lunarShort = computed(() => {
  const raw = String(festSource.value?.lunarText || '').trim()
  if (!raw) return ''
  // 「二〇二六年九月十八」→「九月十八」
  const m = raw.match(/年(.+)$/)
  return m ? m[1] : raw
})

const nextFest = computed(() => festSource.value?.nextFestival || null)

function tickCountdown() {
  const nf = nextFest.value
  if (!nf?.name) {
    countdownText.value = ''
    return
  }
  if (Number(nf.daysLeft) === 0) {
    countdownText.value = `今天就是「${nf.name}」`
    return
  }
  const target = Date.parse(nf.at)
  if (!Number.isFinite(target)) {
    countdownText.value = `距「${nf.name}」还有 ${nf.daysLeft} 天`
    return
  }
  let ms = target - Date.now()
  if (ms <= 0) {
    countdownText.value = `今天就是「${nf.name}」`
    return
  }
  const sec = Math.floor(ms / 1000)
  const days = Math.floor(sec / 86400)
  const hours = Math.floor((sec % 86400) / 3600)
  const mins = Math.floor((sec % 3600) / 60)
  const secs = sec % 60
  const pad = (n) => String(n).padStart(2, '0')
  if (days > 0) {
    countdownText.value = `距「${nf.name}」还有 ${days} 天 ${pad(hours)}:${pad(mins)}:${pad(secs)}`
  } else {
    countdownText.value = `距「${nf.name}」还有 ${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }
}

const previewList = computed(() => {
  const p = today.value?.preview
  return Array.isArray(p) ? p : []
})

const previewNewest = computed(() =>
  previewList.value.filter((e) => e._bucket !== 'oldest')
)
const previewOldest = computed(() =>
  previewList.value.filter((e) => e._bucket === 'oldest')
)

function tickClock() {
  const p = shanghaiPartsNow()
  clockIso.value = new Date().toISOString()
  clockText.value = `${p.hour}:${p.minute}:${p.second}`
  liveDateKey.value = p.dateKey
  liveDateLabel.value = p.dateLabel
  liveWeekday.value = p.weekday
  refreshSeason(p.month)
  tickCountdown()
  // 北京时间跨日 / 首次：自动重拉「历史上的今天」
  if (p.dateKey !== loadedDateKey && !loadingLock) {
    loadToday(p.dateKey)
  }
}

async function loadMeta() {
  try {
    todayMeta.value = await request('/hub/today/meta')
    metaReady.value = true
  } catch {
    metaReady.value = true
  }
}

async function loadToday(expectKey = '') {
  const key = expectKey || shanghaiPartsNow().dateKey
  loadingLock = true
  todayLoading.value = true
  todayError.value = ''
  // 节日瞬时接口，不跟历史事件绑死
  loadMeta()
  try {
    const data = await request('/hub/today?light=1')
    // 若请求期间已跨日，丢弃过期响应，下一秒 tick 会再拉
    const nowKey = shanghaiPartsNow().dateKey
    if (data?.dateKey && data.dateKey !== nowKey) {
      loadedDateKey = ''
      return
    }
    today.value = data
    if (!todayMeta.value) todayMeta.value = data
    metaReady.value = true
    loadedDateKey = data?.dateKey || key
  } catch (e) {
    todayError.value = e.message || '加载历史上的今天失败'
    today.value = null
    loadedDateKey = ''
  } finally {
    todayLoading.value = false
    loadingLock = false
  }
}

function onVisibility() {
  if (document.visibilityState !== 'visible') return
  const key = shanghaiPartsNow().dateKey
  if (key !== loadedDateKey) loadToday(key)
}

onMounted(() => {
  tickClock()
  clockTimer = window.setInterval(tickClock, 1000)
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  if (clockTimer) window.clearInterval(clockTimer)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style scoped>
.hub {
  position: relative;
  animation: rise 0.45s ease both;
}

.season-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0 0.55rem;
}

.season {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.22rem 0.7rem 0.22rem 0.45rem;
  border-radius: 999px;
  background: rgba(248, 215, 228, 0.55);
  border: 1px solid rgba(232, 145, 176, 0.35);
  color: #a34e72;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.season[data-season='summer'] {
  background: rgba(184, 224, 200, 0.55);
  border-color: rgba(31, 122, 77, 0.28);
  color: #1f7a4d;
}

.season[data-season='autumn'] {
  background: rgba(243, 215, 184, 0.6);
  border-color: rgba(196, 92, 38, 0.28);
  color: #9a4b1c;
}

.season[data-season='winter'] {
  background: rgba(196, 214, 240, 0.55);
  border-color: rgba(70, 110, 160, 0.28);
  color: #3a5f8a;
}

.intro {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 0.55rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(2rem, 5vw, 2.8rem);
}

.intro > div p.muted {
  margin: 0.4rem 0 0;
}

.contact {
  margin: 0;
  font-size: 0.82rem;
  white-space: nowrap;
  flex-shrink: 0;
  text-decoration: none;
  border-bottom: 1px dashed transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.contact:hover {
  color: #a34e72;
  border-bottom-color: rgba(163, 78, 114, 0.45);
}

.today {
  margin: 0.85rem 0 0.35rem;
  padding: 1.1rem 1.25rem 1.15rem;
  border-radius: var(--radius);
  border: 1px solid rgba(31, 122, 77, 0.14);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(232, 242, 236, 0.75)),
    radial-gradient(520px 180px at 100% 0%, rgba(243, 215, 184, 0.35), transparent 60%);
  box-shadow: var(--shadow);
}

.today-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 0.55rem;
}

.today-eyebrow {
  margin: 0 0 0.2rem;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}

.today h2 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.35rem, 3.5vw, 1.75rem);
  font-weight: 600;
  letter-spacing: 0.08em;
}

.today-clock {
  text-align: right;
  flex-shrink: 0;
}

.today-clock time {
  display: block;
  font-family: var(--display);
  font-size: clamp(1.55rem, 4vw, 2rem);
  font-weight: 600;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: var(--accent);
}

.today-date {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.82rem;
  color: var(--muted);
}

.today-fest {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #8a3d5c;
}

.today-lunar {
  font-weight: 500;
}

.today-countdown {
  margin: 0 0 0.75rem;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem 0.55rem;
  font-size: 0.92rem;
  line-height: 1.4;
}

.cd-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.today-countdown strong {
  font-family: var(--display);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.cd-date {
  font-size: 0.82rem;
}

.today-events {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
}

.today-events li {
  display: grid;
  grid-template-columns: 4.6rem 1fr;
  gap: 0.65rem;
  align-items: start;
  font-size: 0.9rem;
  line-height: 1.45;
}

.ev-year {
  font-family: var(--display);
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.ev-text {
  color: var(--ink);
}

.today-err,
.today-empty {
  margin: 0;
  font-size: 0.88rem;
}

.today-gap {
  margin: 0.35rem 0;
  text-align: center;
  letter-spacing: 0.35em;
  font-size: 0.85rem;
}

.today-more {
  display: inline-block;
  margin-top: 0.85rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.today-more:hover {
  color: #8a3d5c;
  border-bottom-color: rgba(163, 78, 114, 0.45);
}

.branch {
  height: 52px;
  margin: 0 0 1rem;
  opacity: 0.85;
}

.branch svg {
  width: 100%;
  height: 100%;
  display: block;
}

.twig {
  fill: none;
  stroke: #c9899f;
  stroke-width: 2.2;
  stroke-linecap: round;
  opacity: 0.55;
}

.entries {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.entry {
  position: relative;
  display: block;
  overflow: hidden;
  padding: 1.45rem 1.4rem 1.5rem;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: var(--shadow);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  min-height: 180px;
}

.entry::after {
  content: '';
  position: absolute;
  right: -18px;
  bottom: -22px;
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.9), rgba(244, 182, 203, 0.55) 55%, transparent 70%);
  opacity: 0.35;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.entry:hover {
  transform: translateY(-3px);
  box-shadow: 0 22px 55px rgba(15, 47, 36, 0.16);
  border-color: rgba(232, 145, 176, 0.35);
}

.entry:hover::after {
  opacity: 0.6;
  transform: scale(1.08);
}

.eyebrow {
  display: block;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 0.55rem;
  font-weight: 700;
}

.entry strong {
  display: block;
  font-family: var(--display);
  font-size: 1.75rem;
  margin-bottom: 0.55rem;
}

.entry p {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
}

.forum {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(243, 215, 184, 0.35));
}

.changelog {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(200, 220, 210, 0.5));
}

.pickup {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(184, 224, 200, 0.45));
}

.resources {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(196, 214, 240, 0.5));
}

.games {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(230, 200, 230, 0.45));
}

.arcade {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(255, 210, 170, 0.5));
}

.schedule {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(180, 230, 220, 0.5));
}

.homework {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(255, 228, 196, 0.55));
}

.video {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(248, 215, 228, 0.55));
}

.history {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(232, 220, 196, 0.55));
}

.chocolate {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(232, 181, 122, 0.42));
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 700px) {
  .intro {
    flex-direction: column;
    align-items: flex-start;
  }

  .today-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .today-clock {
    text-align: left;
  }

  .today-events li {
    grid-template-columns: 3.8rem 1fr;
    gap: 0.45rem;
  }

  .entries {
    grid-template-columns: 1fr;
  }

  .branch {
    height: 40px;
  }
}
</style>
