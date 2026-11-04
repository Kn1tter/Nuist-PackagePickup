<template>
  <main class="panel miss">
    <p class="code">404</p>
    <h1>这里没有樱花，也没有页面</h1>
    <p class="muted">链接可能写错了，或者内容已经搬走。</p>
    <div class="row">
      <RouterLink class="btn" to="/hub">回到平台</RouterLink>
      <RouterLink class="btn ghost" to="/">欢迎页</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.miss {
  padding: 2.4rem 1.6rem;
  text-align: center;
  animation: rise 0.4s ease both;
}

.code {
  margin: 0;
  font-size: 0.85rem;
  letter-spacing: 0.2em;
  color: var(--sakura);
  font-weight: 700;
}

h1 {
  margin: 0.55rem 0 0.4rem;
  font-family: var(--display);
  font-size: clamp(1.5rem, 4vw, 2rem);
}

.row {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.35rem;
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
