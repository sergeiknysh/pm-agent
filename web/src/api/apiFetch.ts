export class ApiError extends Error {
  status: number
  bodyText?: string

  constructor(message: string, status: number, bodyText?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.bodyText = bodyText
  }
}

type UnauthorizedHandler = (info: { url: string; status: number }) => void

let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler
}

function mergeHeaders(a?: HeadersInit, b?: HeadersInit): Headers {
  const h = new Headers(a)
  if (b) {
    for (const [k, v] of new Headers(b).entries()) h.set(k, v)
  }
  return h
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: mergeHeaders(init.headers),
  })

  if (res.status === 401) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    unauthorizedHandler?.({ url, status: res.status })
  }

  return res
}

export async function readErrorBody(res: Response): Promise<string> {
  // Prefer JSON error payloads, fallback to text.
  const ct = res.headers.get('content-type') ?? ''
  try {
    if (ct.includes('application/json')) {
      const data = (await res.json()) as any
      if (data && typeof data.error === 'string') return data.error
      return JSON.stringify(data)
    }
  } catch {
    // ignore
  }
  try {
    return await res.text()
  } catch {
    return ''
  }
}
