<template>
  <main class="hub">
    <section class="intro">
      <div>
        <h1>Make NUIST Better</h1>
        <p class="muted">论坛 · 代拿 · 资源库 · 一站式校园互助</p>
      </div>
      <p class="contact muted">联系QQ:1440205803</p>
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

      <RouterLink class="entry resources" to="/resources">
        <span class="eyebrow">Resource Hub</span>
        <strong>资源库</strong>
        <p>课件、历年卷、软件与学习资料链接，分类浏览、一键打开。</p>
      </RouterLink>
    </div>
  </main>
</template>

<style scoped>
.hub {
  animation: rise 0.45s ease both;
}

.intro {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(2rem, 5vw, 2.8rem);
}

.intro > div p {
  margin: 0.4rem 0 0;
}

.contact {
  margin: 0;
  font-size: 0.82rem;
  white-space: nowrap;
  flex-shrink: 0;
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
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(243, 215, 184, 0.35));
}

.pickup {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(184, 224, 200, 0.45));
}

.resources {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(196, 214, 240, 0.5));
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

  .entries {
    grid-template-columns: 1fr;
  }
}
</style>
