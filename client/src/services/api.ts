let csrfToken = ''
export function setCsrfToken(value: string) {
  csrfToken = value
}
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...options.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new ApiError(
      0,
      'Cannot reach the server. Check your connection and try again.',
    )
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('session-expired'))
    throw new ApiError(
      response.status,
      body?.error?.message || 'Request failed. Try again.',
    )
  }
  if (response.status === 204) return undefined as T
  const body = await response.json()
  return body.data as T
}
export const send = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
