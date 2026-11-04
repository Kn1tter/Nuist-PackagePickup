<template>
  <Teleport to="body">
    <div class="announce-layer" role="dialog" aria-modal="true" aria-labelledby="announce-title">
      <button type="button" class="announce-backdrop" aria-label="关闭公告" @click="dismiss" />
      <section class="announce-sheet" @click.stop>
        <p class="eyebrow">全站公告</p>
        <h2 id="announce-title">{{ displayTitle }}</h2>
        <p class="body">{{ message.body }}</p>
        <p v-if="message.created_at" class="time muted">{{ formatTime(message.created_at) }}</p>
        <div class="actions">
          <button
            v-if="hasLink"
            type="button"
            class="ghost"
            :disabled="busy"
            @click="goLink"
          >
            查看详情
          </button>
          <button type="button" class="primary" :disabled="busy" @click="dismiss">
            {{ busy ? '处理中…' : '我知道了' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { formatTime } from '../lib/time'

const props = defineProps({
  message: { type: Object, required: true },
})
const emit = defineEmits(['dismiss'])

const busy = ref(false)

function onKey(e) {
  if (e.key === 'Escape') dismiss()
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const displayTitle = computed(() =>
  String(props.message.title || '')
    .replace(/^【全站公告】\s*/, '')
    .trim() || '全站公告'
)

const hasLink = computed(() => {
  const link = String(props.message.link || '').trim()
  return !!link && link !== '/messages'
})

function dismiss() {
  if (busy.value) return
  busy.value = true
  emit('dismiss', props.message)
}

function goLink() {
  if (busy.value) return
  busy.value = true
  const link = String(props.message.link || '').trim()
  emit('dismiss', props.message, link)
}
</script>

<style scoped>
.announce-layer {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: grid;
  place-items: center;
  padding: 1.25rem;
}

.announce-backdrop {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  border: none;
  cursor: pointer;
  background: rgba(12, 18, 16, 0.72);
  backdrop-filter: blur(8px);
}

.announce-sheet {
  position: relative;
  z-index: 1;
  width: min(720px, 100%);
  max-height: min(86vh, 900px);
  overflow: auto;
  padding: clamp(1.6rem, 4vw, 2.6rem);
  border-radius: 28px;
  background:
    radial-gradient(120% 80% at 10% 0%, rgba(31, 122, 77, 0.14), transparent 55%),
    #fff;
  border: 1px solid rgba(20, 36, 28, 0.12);
  box-shadow: 0 30px 80px rgba(8, 16, 12, 0.35);
  animation: pop 0.35s ease both;
}

.eyebrow {
  margin: 0 0 0.7rem;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent, #1f7a4d);
}

h2 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.8rem, 5vw, 2.6rem);
  line-height: 1.2;
  color: var(--ink, #14241c);
}

.body {
  margin: 1.15rem 0 0;
  font-size: clamp(1.05rem, 2.4vw, 1.28rem);
  line-height: 1.7;
  color: #2a3b32;
  white-space: pre-wrap;
  word-break: break-word;
}

.time {
  margin: 1.1rem 0 0;
  font-size: 0.9rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.6rem;
}

button {
  border: none;
  border-radius: 999px;
  padding: 0.85rem 1.4rem;
  font-weight: 800;
  cursor: pointer;
  font-size: 1rem;
}

button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.primary {
  background: var(--accent, #1f7a4d);
  color: #fff;
  min-width: 9rem;
}

.primary:not(:disabled):hover {
  filter: brightness(1.05);
}

.ghost {
  background: rgba(20, 36, 28, 0.07);
  color: var(--ink, #14241c);
}

.muted {
  color: var(--muted, #6b7c72);
}

@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 520px) {
  .announce-sheet {
    border-radius: 22px;
    padding: 1.35rem 1.2rem 1.4rem;
  }

  .actions {
    flex-direction: column-reverse;
  }

  button {
    width: 100%;
  }
}
</style>
