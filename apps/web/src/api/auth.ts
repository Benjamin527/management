import { apiRequest } from './client'

export interface SessionUser { id: string; email: string; name?: string; role: string }

export const authApi = {
  me: () => apiRequest<SessionUser>('/auth/me'),
  login: (email: string, password: string) => apiRequest<{ user: SessionUser }>('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  logout: () => apiRequest<{ success: true }>('/auth/logout', { method: 'POST' }),
}
