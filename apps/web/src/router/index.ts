import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppLayout from '../layouts/AppLayout.vue'
import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import CustomersView from '../views/CustomersView.vue'
import IssuesView from '../views/IssuesView.vue'
import ConsumptionView from '../views/ConsumptionView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView, meta: { public: true } },
    {
      path: '/', component: AppLayout, redirect: '/dashboard', children: [
        { path: 'dashboard', component: DashboardView },
        { path: 'customers', component: CustomersView },
        { path: 'issues', component: IssuesView },
        { path: 'consumption', component: ConsumptionView },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.loadCurrentUser()
  if (!to.meta.public && !auth.user) return '/login'
  if (to.path === '/login' && auth.user) return '/dashboard'
})
