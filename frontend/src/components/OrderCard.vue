<template>
  <article class="card panel" @click="$emit('open', order)">
    <div class="row">
      <strong>{{ order.dorm_building }}</strong>
      <span class="status" :class="order.status">{{ statusText }}</span>
    </div>
    <p class="meta muted">
      {{ order.express_company || '快递' }} · {{ sizeText }} · 尾号 {{ order.phone_last4 }}
    </p>
    <div class="row bottom">
      <span class="reward">¥{{ Number(order.reward).toFixed(1) }}</span>
      <span class="muted time">{{ order.created_at }}</span>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  order: { type: Object, required: true },
})
defineEmits(['open'])

const map = {
  pending: '待接单',
  accepted: '已接单',
  picked: '已取件',
  delivered: '已送达',
  done: '已完成',
  cancelled: '已取消',
}
const sizeMap = { small: '小件', medium: '中件', large: '大件' }

const statusText = computed(() => map[props.order.status] || props.order.status)
const sizeText = computed(() => sizeMap[props.order.package_size] || props.order.package_size)
</script>

<style scoped>
.card {
  padding: 1rem 1.1rem;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  animation: fadeUp 0.45s ease both;
}

.card:hover {
  transform: translateY(-3px);
  box-shadow: 0 22px 40px rgba(15, 47, 36, 0.16);
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.meta {
  margin: 0.55rem 0 0.85rem;
  font-size: 0.9rem;
}

.reward {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--accent-2);
}

.time {
  font-size: 0.8rem;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
