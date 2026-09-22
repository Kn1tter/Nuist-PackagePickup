<template>
  <div class="shell">
    <header class="top">
      <RouterLink to="/" class="brand-block">
        <div class="brand">南信大代取</div>
        <p class="muted tagline">校园快递互助 · 线下结算</p>
      </RouterLink>
      <nav v-if="showNav" class="nav">
        <RouterLink to="/">大厅</RouterLink>
        <RouterLink to="/post">发单</RouterLink>
        <RouterLink to="/profile">我的</RouterLink>
      </nav>
    </header>
    <RouterView />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const showNav = computed(() => route.name !== 'login')
</script>

<style scoped>
.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1.5rem;
  animation: rise 0.5s ease both;
}

.brand-block .tagline {
  margin: 0.2rem 0 0;
  font-size: 0.92rem;
}

.nav {
  display: flex;
  gap: 0.85rem;
  padding: 0.45rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--line);
}

.nav a {
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.92rem;
}

.nav a.router-link-active {
  background: var(--bg-deep);
  color: #fff;
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

@media (max-width: 640px) {
  .top {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
