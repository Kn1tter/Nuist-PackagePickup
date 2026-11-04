<template>
  <main class="page">
    <header class="head">
      <div>
        <p class="eyebrow">Clip Grab</p>
        <h1>视频解析下载</h1>
        <p class="muted">
          粘贴抖音 / B 站分享链接，或网盘直链。直链要在已登录的网盘页面用
          <a href="https://github.com/hmjz100/LinkSwift" target="_blank" rel="noopener">LinkSwift</a>
          复制：它调用网盘自己的下载接口，不破解限速。贴过来之后，百度直链会自动改用 UA
          <code>pan.baidu.com</code>，阿里云盘直链会带上 Referer，避免大文件被 403。文件由浏览器下载到本机，服务器不保留。
        </p>
      </div>
    </header>

    <section class="panel">
      <label class="field">
        <span>分享链接</span>
        <textarea
          v-model="text"
          rows="3"
          placeholder="视频分享链接，或 LinkSwift 复制出的网盘直链"
          :disabled="busy"
        />
      </label>

      <p v-if="detected" class="detect">
        检测到链接：
        <code>{{ detected }}</code>
      </p>
      <p v-if="panShare" class="err">
        这是网盘分享页，服务器没有你的登录态，不能代为取直链。请在已登录的网盘里用 LinkSwift 复制 API 直链，再贴回这里。
      </p>

      <div class="actions">
        <button type="button" class="ghost" :disabled="busy || !detected" @click="askConfirm">
          检测链接
        </button>
        <button type="button" class="primary" :disabled="busy || !detected" @click="startDownload">
          {{ busy ? '解析中…' : '确认下载到本机' }}
        </button>
      </div>

      <p v-if="hint" class="hint">{{ hint }}</p>
      <p v-if="error" class="err">{{ error }}</p>
    </section>

    <section v-if="ticket" class="panel result">
      <div class="status-row">
        <strong>{{ ticket.title || '已解析' }}</strong>
        <span class="pill" data-status="done">可下载</span>
      </div>
      <ul v-if="ticket.files?.length" class="files">
        <li v-for="f in ticket.files" :key="f.downloadUrl">
          <span>{{ f.name }}</span>
          <button type="button" class="linkish" @click="browserDownload(f)">下载到本机</button>
        </li>
      </ul>
    </section>

    <p class="note muted">
      仅供个人学习使用，请遵守平台条款与版权法规。点击下载后由浏览器保存到本机，服务器不缓存文件。
    </p>
  </main>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { apiBase, request } from '../api/request'

const text = ref('')
const busy = ref(false)
const error = ref('')
const hint = ref('')
const ticket = ref(null)

const URL_RE = /https?:\/\/[^\s"'<>[\]]+/g
const VIDEO_HOST_RE =
  /b23\.tv|bilibili\.com|acg\.tv|douyin\.com|iesdouyin\.com|v\.douyin\.com|kuaishou\.com|v\.qq\.com|youtube\.com|youtu\.be|xiaohongshu\.com|xhslink\.com/i

const PAN_SHARE_RE =
  /pan\.baidu\.com\/(?:s|share)\/|pan\.quark\.cn\/s\/|drive\.uc\.cn\/s\/|(?:alipan|aliyundrive)\.com\/s\/|123(?:pan|684|865|912|952)\.(?:com|cn)\/s\/|pan\.xunlei\.com\/s\/|cloud\.189\.cn\/(?:t\/|web\/share)|yun\.139\.com\/(?:w\/|share)|guangyapan\.com\/(?:s\/|share)/i

const detected = computed(() => {
  const urls = String(text.value).match(URL_RE) || []
  return rankUrls(urls)[0] || ''
})

const panShare = computed(() => PAN_SHARE_RE.test(detected.value))

function rankUrls(urls) {
  const video = []
  const others = []
  for (const u of urls) {
    if (/\.(jpg|jpeg|png|gif|webp|ico)(\?|$)/i.test(u)) continue
    if (VIDEO_HOST_RE.test(u)) video.push(u)
    else others.push(u)
  }
  return [...video, ...others]
}

function askConfirm() {
  if (!detected.value) {
    error.value = '未识别到链接'
    return
  }
  hint.value = '🔍 检测到链接，是否要下载到本机？点击「确认下载到本机」开始。'
  error.value = ''
}

function browserDownload(file) {
  // 触发浏览器下载管理器 → 本机「下载」文件夹；服务器只中转不落盘
  const a = document.createElement('a')
  // downloadUrl 已含 /api 前缀，勿再拼一层
  a.href = `${apiBase}${file.downloadUrl}`
  a.download = file.name || 'download'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  hint.value = '已交给浏览器下载，请在浏览器下载栏查看（保存到本机下载文件夹）。'
}

async function startDownload() {
  if (!detected.value) {
    error.value = '未识别到链接'
    return
  }
  busy.value = true
  error.value = ''
  hint.value = '🔍 正在解析链接…'
  ticket.value = null
  try {
    const data = await request('/video/prepare', {
      method: 'POST',
      body: { url: detected.value },
    })
    ticket.value = data.ticket
    busy.value = false
    if (!data.ticket?.files?.length) {
      error.value = '解析成功但没有可下载文件'
      return
    }
    // 自动触发第一个文件的浏览器下载
    for (const f of data.ticket.files) {
      browserDownload(f)
    }
    hint.value =
      data.ticket.files.length > 1
        ? `已开始下载 ${data.ticket.files.length} 个文件到本机。`
        : '已开始下载到本机下载文件夹。'
  } catch (e) {
    error.value = e.message
    busy.value = false
  }
}

watch(text, () => {
  error.value = ''
})
</script>

<style scoped>
.page {
  animation: rise 0.4s ease both;
}

.head {
  margin-bottom: 1.1rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.8rem, 4vw, 2.4rem);
}

.head .muted {
  margin: 0.4rem 0 0;
}

.panel {
  padding: 1.2rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--shadow);
  margin-bottom: 1rem;
}

.field {
  display: grid;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--muted);
}

textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.75rem 0.85rem;
  resize: vertical;
  background: #fff;
  color: var(--ink);
}

.detect {
  margin: 0.85rem 0 0;
  font-size: 0.88rem;
  word-break: break-all;
}

.detect code {
  color: var(--accent);
  font-family: inherit;
}

.actions {
  display: flex;
  gap: 0.7rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

button {
  border: none;
  border-radius: 999px;
  padding: 0.65rem 1.15rem;
  cursor: pointer;
  font-weight: 700;
}

button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.primary {
  background: var(--accent);
  color: #fff;
}

.ghost {
  background: rgba(20, 36, 28, 0.06);
  color: var(--ink);
}

.hint {
  margin: 0.85rem 0 0;
  color: var(--accent);
  font-size: 0.92rem;
}

.err {
  margin: 0.75rem 0 0;
  color: #c0392b;
  font-size: 0.9rem;
}

.status-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}

.pill {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: rgba(31, 122, 77, 0.18);
  color: var(--accent);
}

.files {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.files li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  background: rgba(20, 36, 28, 0.04);
  font-size: 0.9rem;
}

.linkish {
  background: none;
  color: var(--accent);
  padding: 0;
  border-radius: 0;
}

.note {
  font-size: 0.82rem;
  margin: 0.25rem 0 0;
  line-height: 1.5;
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
