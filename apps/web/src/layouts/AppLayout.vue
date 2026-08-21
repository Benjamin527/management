<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const titles: Record<string, string> = {
  "/dashboard": "服务总览",
  "/customers": "客户中心",
  "/issues": "服务问题",
  "/service-analysis": "服务分析",
  "/service-records": "服务记录",
  "/consumption": "消费分析",
};
const title = computed(() =>
  route.path.startsWith("/customers/")
    ? "客户服务档案"
    : titles[route.path] || "售后运营",
);
const dateParts = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());
const datePart = (type: Intl.DateTimeFormatPartTypes) =>
  dateParts.find((item) => item.type === type)?.value || "";
const currentDate = `${datePart("year")} · ${datePart("month")} · ${datePart("day")}`;
async function logout() {
  await auth.logout();
  await router.push("/login");
}
</script>

<template>
  <div class="app-shell">
    <aside class="service-rail">
      <div class="brand">
        <span class="brand-mark">S</span>
        <div><strong>Service OS</strong><small>售后运营中枢</small></div>
      </div>
      <div class="pulse-line" aria-hidden="true"><i></i><i></i><i></i></div>
      <nav>
        <RouterLink to="/dashboard"><span>⌁</span>服务总览</RouterLink>
        <RouterLink to="/customers"><span>◎</span>客户中心</RouterLink>
        <RouterLink to="/service-analysis"><span>⌇</span>服务分析</RouterLink>
        <RouterLink to="/service-records"><span>◇</span>服务记录</RouterLink>
        <RouterLink to="/consumption"><span>↗</span>消费分析</RouterLink>
        <button disabled><span>∷</span>团队效能<em>即将开放</em></button>
      </nav>
      <div class="rail-foot">
        <span class="online-dot"></span>
        <div>
          <strong>{{ auth.user?.name || auth.user?.email }}</strong
          ><small>{{ auth.user?.role }}</small>
        </div>
        <button @click="logout" title="退出登录">↪</button>
      </div>
    </aside>
    <main class="app-main">
      <header class="topbar app-topbar">
        <div>
          <small>AFTER-SALES OPERATIONS</small>
          <h1>{{ title }}</h1>
        </div>
        <div class="date-chip">{{ currentDate }}</div>
      </header>
      <RouterView />
    </main>
  </div>
</template>
