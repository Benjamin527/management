<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const email = ref('wangyuxuan@example.com')
const password = ref('')
const error = ref('')
const loading = ref(false)
const auth = useAuthStore()
const router = useRouter()
async function submit() {
  loading.value = true; error.value = ''
  try { await auth.login(email.value, password.value); await router.push('/dashboard') }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '登录未完成' }
  finally { loading.value = false }
}
</script>
<template>
  <main class="login-page">
    <section class="login-story"><div class="story-mark">S</div><p>把每一次客户反馈，变成下一次服务改进。</p><div class="story-line"><span></span><span></span><span></span></div></section>
    <section class="login-panel"><div><small>SERVICE OPERATIONS</small><h1>回到服务现场</h1><p>登录后查看客户状态、问题流转和团队响应。</p></div><form @submit.prevent="submit"><label>邮箱<input v-model="email" type="email" autocomplete="username" required /></label><label>密码<input v-model="password" type="password" autocomplete="current-password" minlength="8" required /></label><p v-if="error" class="form-error">{{ error }}</p><button class="primary-button" :disabled="loading">{{ loading ? '正在进入…' : '登录工作台' }}</button></form></section>
  </main>
</template>
