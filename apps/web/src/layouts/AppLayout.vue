<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const titles: Record<string, string> = { '/dashboard': '服务总览', '/customers': '客户中心', '/issues': '服务问题', '/consumption': '消费分析' }
const title = computed(() => titles[route.path] || '售后运营')
async function logout() { await auth.logout(); await router.push('/login') }
</script>

<template>
  <div class="app-shell">
    <aside class="service-rail">
      <div class="brand"><span class="brand-mark">S</span><div><strong>Service OS</strong><small>售后运营中枢</small></div></div>
      <div class="pulse-line" aria-hidden="true"><i></i><i></i><i></i></div>
      <nav>
        <RouterLink to="/dashboard"><span>⌁</span>服务总览</RouterLink>
        <RouterLink to="/customers"><span>◎</span>客户中心</RouterLink>
        <RouterLink to="/issues"><span>◇</span>服务问题</RouterLink>
        <RouterLink to="/consumption"><span>↗</span>消费分析</RouterLink>
        <button disabled><span>∷</span>团队效能<em>即将开放</em></button>
      </nav>
      <div class="rail-foot"><span class="online-dot"></span><div><strong>{{ auth.user?.name || auth.user?.email }}</strong><small>{{ auth.user?.role }}</small></div><button @click="logout" title="退出登录">↪</button></div>
    </aside>
    <main>
      <header class="topbar"><div><small>AFTER-SALES OPERATIONS</small><h1>{{ title }}</h1></div><div class="date-chip">2026 · 08 · 20</div></header>
      <RouterView />
    </main>
  </div>
</template>
