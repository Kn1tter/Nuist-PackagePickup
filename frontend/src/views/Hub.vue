<template>
  <main class="hub">
    <section class="intro">
      <h1>Make NUIST Better</h1>
      <p class="muted">选一个入口 · 论坛交流反馈 · 快递互助代拿</p>
    </section>

    <div class="entries">
      <RouterLink class="entry forum" to="/forum">
        <span class="eyebrow">Campus Talk</span>
        <strong>校园论坛</strong>
        <p>吐槽、求助、反馈校园生活，和同学一起把南信大变好一点。</p>
      </RouterLink>

      <RouterLink class="entry pickup" to="/pickup">
        <span class="eyebrow">Package Pickup</span>
        <strong>代拿快递</strong>
        <p>发单、接单、线下结算；取件码仅接单后可见。</p>
      </RouterLink>
    </div>
  </main>
</template>

<style scoped>
.hub {
  animation: rise 0.45s ease both;
}

.intro {
  margin-bottom: 1.25rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(2rem, 5vw, 2.8rem);
}

.intro p {
  margin: 0.4rem 0 0;
}

.entries {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.entry {
  display: block;
  padding: 1.45rem 1.4rem 1.5rem;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: var(--shadow);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  min-height: 180px;
}

.entry:hover {
  transform: translateY(-3px);
  box-shadow: 0 22px 55px rgba(15, 47, 36, 0.16);
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
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(243, 215, 184, 0.35));
}

.pickup {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(184, 224, 200, 0.45));
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
  .entries {
    grid-template-columns: 1fr;
  }
}
</style>
