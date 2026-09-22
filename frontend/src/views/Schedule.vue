<template>
  <main class="wrap">
    <div class="hero panel">
      <div>
        <h1>课表</h1>
        <p class="muted">
          当前约第 {{ currentWeek }} 周 · 教务（jwxt）需校园网/统一认证，本站无法代登录抓取。请从
          <a href="https://jwxt.nuist.edu.cn" target="_blank" rel="noopener">本科生教务系统</a>
          查看后粘贴或手动录入，再按日生成网页悬浮窗。
        </p>
      </div>
    </div>

    <section class="panel block">
      <h2>学期设置</h2>
      <div class="row">
        <div class="field grow">
          <label>本学期第一周周一的日期</label>
          <input v-model="termStart" type="date" />
        </div>
        <button class="btn" type="button" :disabled="saving" @click="saveTerm">
          {{ saving ? '保存中…' : '保存并刷新周次' }}
        </button>
      </div>
    </section>

    <section class="panel block">
      <h2>生成网页悬浮窗（按日）</h2>
      <div class="row">
        <div class="field">
          <label>星期</label>
          <select v-model.number="floatDay">
            <option v-for="d in 7" :key="d" :value="d">周{{ '一二三四五六日'[d - 1] }}</option>
          </select>
        </div>
        <div class="field">
          <label>第几周</label>
          <input v-model.number="floatWeek" type="number" min="1" max="30" />
        </div>
        <button class="btn" type="button" @click="openFloat">打开悬浮窗</button>
      </div>
      <p class="tip muted">会弹出小窗口，例如：第4周 16:00-18:00 大学物理 滨江楼A101</p>
    </section>

    <section class="panel block">
      <h2>粘贴导入</h2>
      <p class="tip muted">每行一条：`课程名|周一|16:00-18:00|滨江楼A101|1-16`</p>
      <textarea v-model="pasteText" rows="5" placeholder="大学物理|周一|16:00-18:00|滨江楼A101|1-16" />
      <div class="row">
        <button class="btn" type="button" :disabled="importing" @click="doImport">
          {{ importing ? '导入中…' : '识别并导入' }}
        </button>
        <button class="btn ghost" type="button" @click="clearAll">清空课表</button>
      </div>
    </section>

    <section class="panel block">
      <h2>手动添加</h2>
      <form class="grid" @submit.prevent="addOne">
        <div class="field">
          <label>课程</label>
          <input v-model="form.name" required placeholder="大学物理" />
        </div>
        <div class="field">
          <label>星期</label>
          <select v-model.number="form.day_of_week">
            <option v-for="d in 7" :key="d" :value="d">周{{ '一二三四五六日'[d - 1] }}</option>
          </select>
        </div>
        <div class="field">
          <label>开始</label>
          <input v-model="form.start_time" required placeholder="16:00" />
        </div>
        <div class="field">
          <label>结束</label>
          <input v-model="form.end_time" required placeholder="18:00" />
        </div>
        <div class="field grow">
          <label>地点</label>
          <input v-model="form.location" placeholder="滨江楼A101" />
        </div>
        <div class="field">
          <label>周次</label>
          <input v-model="form.weeks" placeholder="1-16" />
        </div>
        <button class="btn" type="submit" :disabled="adding">添加</button>
      </form>
    </section>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="okMsg" class="ok">{{ okMsg }}</p>

    <section class="list">
      <h2>我的课程 {{ courses.length }}</h2>
      <article v-for="c in courses" :key="c.id" class="panel card">
        <div class="card-top">
          <strong
            >周{{ '一二三四五六日'[c.day_of_week - 1] }} {{ c.start_time }}-{{ c.end_time }}
            {{ c.name }}</strong
          >
          <button class="link-del" type="button" @click="remove(c.id)">删除</button>
        </div>
        <p class="muted">{{ c.location || '地点未填' }} · 第 {{ c.weeks }} 周</p>
      </article>
      <p v-if="!loading && !courses.length" class="muted empty">还没有课程，先导入或添加几门吧。</p>
    </section>
  </main>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { request } from '../api/request'

const courses = ref([])
const currentWeek = ref(1)
const termStart = ref('')
const floatDay = ref(new Date().getDay() || 7)
const floatWeek = ref(1)
const pasteText = ref('')
const loading = ref(true)
const saving = ref(false)
const importing = ref(false)
const adding = ref(false)
const error = ref('')
const okMsg = ref('')

const form = reactive({
  name: '',
  day_of_week: 1,
  start_time: '08:00',
  end_time: '09:40',
  location: '',
  weeks: '1-16',
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await request('/schedule')
    courses.value = data.courses || []
    currentWeek.value = data.current_week || 1
    floatWeek.value = data.current_week || 1
    termStart.value = data.term_start_date || ''
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function saveTerm() {
  saving.value = true
  error.value = ''
  okMsg.value = ''
  try {
    const data = await request('/schedule/settings', {
      method: 'PUT',
      body: { term_start_date: termStart.value },
    })
    currentWeek.value = data.current_week || 1
    floatWeek.value = data.current_week || 1
    okMsg.value = `已保存，当前约第 ${currentWeek.value} 周`
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

function openFloat() {
  const url = `/schedule/float?day=${floatDay.value}&week=${floatWeek.value}`
  window.open(url, 'nuist-schedule-float', 'width=360,height=520,menubar=no,toolbar=no,location=no,status=no')
}

async function doImport() {
  importing.value = true
  error.value = ''
  okMsg.value = ''
  try {
    const data = await request('/schedule/import', { method: 'POST', body: { text: pasteText.value } })
    okMsg.value = `成功导入 ${data.count} 门课` + (data.skipped ? `（跳过 ${data.skipped} 行）` : '')
    pasteText.value = ''
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    importing.value = false
  }
}

async function addOne() {
  adding.value = true
  error.value = ''
  try {
    await request('/schedule/courses', { method: 'POST', body: { ...form } })
    form.name = ''
    form.location = ''
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    adding.value = false
  }
}

async function remove(id) {
  try {
    await request(`/schedule/courses/${id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function clearAll() {
  if (!confirm('确定清空全部课程？')) return
  try {
    await request('/schedule/courses', { method: 'DELETE' })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

onMounted(load)
</script>

<style scoped>
.wrap {
  display: grid;
  gap: 1rem;
}

.hero,
.block,
.card {
  padding: 1.2rem 1.3rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.8rem;
}

h2 {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
}

.hero p {
  margin: 0.4rem 0 0;
  line-height: 1.45;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}

.field.grow {
  flex: 1;
  min-width: 180px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
  align-items: end;
}

textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  background: #fff;
  margin-bottom: 0.75rem;
}

.tip {
  margin: 0 0 0.65rem;
  font-size: 0.88rem;
}

.ok {
  color: var(--accent);
  font-weight: 600;
}

.list {
  display: grid;
  gap: 0.65rem;
}

.card-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: flex-start;
}

.card p {
  margin: 0.35rem 0 0;
}

.link-del {
  border: none;
  background: none;
  color: #a33;
  cursor: pointer;
  font-size: 0.85rem;
}

.empty {
  padding: 1rem 0;
}
</style>
