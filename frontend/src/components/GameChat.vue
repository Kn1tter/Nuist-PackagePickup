<template>
  <div class="chat">
    <div ref="logEl" class="log">
      <p v-if="!messages.length" class="muted empty">局内聊天</p>
      <div v-for="(m, i) in messages" :key="i" class="line" :class="{ self: m.self }">
        <span class="name">{{ displayName(m) }}</span>
        <span class="text">{{ m.text }}</span>
      </div>
    </div>
    <form class="compose" @submit.prevent="submit">
      <input
        v-model="draft"
        maxlength="80"
        placeholder="说点什么…"
        :disabled="disabled"
        autocomplete="off"
      />
      <button class="btn sm" type="submit" :disabled="disabled || !draft.trim()">发</button>
    </form>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  messages: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['send'])

const draft = ref('')
const logEl = ref(null)

watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  }
)

function displayName(m) {
  if (m?.self) return '我'
  return m?.nickname || m?.from || m?.student_id || '玩家'
}

function submit() {
  const text = draft.value.trim()
  if (!text || props.disabled) return
  emit('send', text)
  draft.value = ''
}
</script>

<style scoped>
.chat {
  margin-top: 0.85rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 200px;
}

.log {
  flex: 1;
  overflow-y: auto;
  padding: 0.55rem 0.7rem;
  display: grid;
  gap: 0.3rem;
  min-height: 72px;
}

.line {
  font-size: 0.86rem;
  line-height: 1.35;
}

.line.self .name {
  color: var(--accent);
}

.name {
  font-weight: 700;
  margin-right: 0.35rem;
  color: var(--ink);
}

.text {
  color: var(--ink);
  word-break: break-word;
}

.empty {
  margin: 0;
  font-size: 0.82rem;
}

.compose {
  display: flex;
  gap: 0.4rem;
  padding: 0.45rem 0.5rem;
  border-top: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.9);
}

.compose input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.4rem 0.75rem;
  background: #fff;
}

.sm {
  padding: 0.4rem 0.85rem;
  font-size: 0.86rem;
}
</style>
