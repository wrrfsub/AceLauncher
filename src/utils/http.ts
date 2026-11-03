import { BRANDING } from '../shared/branding.ts'

let userAgent = `${BRANDING.userAgentProduct} (+${BRANDING.contact})`
export function setAppVersion(version: string): void {
  userAgent = `${BRANDING.userAgentProduct}/${version} (+${BRANDING.contact})`
}

export class HttpError extends Error {
  readonly status: number
  readonly url: string
  readonly body: string
  constructor(status: number, url: string, body: string) {
    super(`HTTP ${status} from ${new URL(url).host}`)
    this.name = 'HttpError'
    this.status = status
    this.url = url
    this.body = body
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown
  form?: Record<string, string>
  timeoutMs?: number
}

/** fetch with a User-Agent, a timeout, JSON/form bodies and errors that say which host failed. */
export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const { json, form, timeoutMs = 20_000, signal, ...init } = opts
  const headers = new Headers(init.headers)
  headers.set('User-Agent', userAgent)
  let body: string | undefined
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
    headers.set('Accept', 'application/json')
    body = JSON.stringify(json)
  } else if (form) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded')
    body = new URLSearchParams(form).toString()
  }
  const timeout = AbortSignal.timeout(timeoutMs)
  let res: Response
  try {
    res = await fetch(url, { ...init, headers, body, signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  } catch (e) {
    if (timeout.aborted) throw new Error(`Request to ${new URL(url).host} timed out`)
    if (signal?.aborted) throw e
    throw new Error(`Could not reach ${new URL(url).host}. Check your internet connection.`)
  }
  if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ''))
  return res
}

export async function getJson<T>(url: string, opts?: RequestOptions): Promise<T> {
  return (await request(url, opts)).json() as Promise<T>
}

export async function postJson<T>(url: string, opts: RequestOptions): Promise<T> {
  return (await request(url, { method: 'POST', ...opts })).json() as Promise<T>
}
