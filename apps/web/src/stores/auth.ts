import { defineStore } from 'pinia'
import { authApi, type SessionUser } from '../api/auth'
import { ApiError } from '../api/client'

const demoUser: SessionUser = { id: 'demo', email: 'wangyuxuan@example.com', name: '王雨轩', role: 'AGENT' }

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null as SessionUser | null, ready: false }),
  actions: {
    async loadCurrentUser() {
      if (import.meta.env.VITE_DEMO_MODE === 'true') {
        this.user = demoUser
        this.ready = true
        return
      }
      try { this.user = await authApi.me() }
      catch (error) {
        if (error instanceof ApiError && error.status === 401) this.user = null
        else throw error
      } finally { this.ready = true }
    },
    async login(email: string, password: string) {
      if (import.meta.env.VITE_DEMO_MODE === 'true') { this.user = demoUser; return }
      this.user = (await authApi.login(email, password)).user
    },
    async logout() {
      if (import.meta.env.VITE_DEMO_MODE !== 'true') await authApi.logout()
      this.user = null
    },
  },
})
