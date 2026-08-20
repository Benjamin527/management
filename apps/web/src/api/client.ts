export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string | string[] }
    const message = Array.isArray(data.message) ? data.message.join('；') : data.message
    throw new ApiError(response.status, message || '请求未完成，请稍后重试')
  }
  return response.json() as Promise<T>
}
