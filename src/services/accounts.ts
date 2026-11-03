import { BrowserWindow, safeStorage, session } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  authorizeUrl,
  createPkce,
  exchangeCode,
  loginMinecraft,
  REDIRECT_URI,
  ReauthRequiredError,
  refreshMicrosoft,
  type MinecraftSession,
} from '../auth/microsoft.ts'
import { db, transaction } from '../database/index.ts'
import type { Account, AppInfo } from '../shared/types.ts'
import { logActivity } from './activity.ts'
import { broadcast } from './events.ts'
import { msClientId } from './settings.ts'

interface Secrets {
  msRefreshToken: string
  mcAccessToken: string
}

interface Row {
  id: string
  uuid: string
  name: string
  skin_url: string | null
  secrets: Uint8Array
  mc_expires_at: number
  needs_reauth: number
  active: number
}

/** On Linux without a keyring Electron falls back to a hard-coded key; we still store, but say so. */
export async function tokenStorage(): Promise<AppInfo['tokenStorage']> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return 'unavailable'
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return 'weak'
  return 'secure'
}

async function seal(secrets: Secrets): Promise<Buffer> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('Secure storage is unavailable on this system, so sign-in tokens cannot be saved.')
  }
  return safeStorage.encryptStringAsync(JSON.stringify(secrets))
}

async function unseal(blob: Uint8Array): Promise<Secrets> {
  const { result } = await safeStorage.decryptStringAsync(Buffer.from(blob))
  return JSON.parse(result) as Secrets
}

function toAccount(r: Row): Account {
  return { id: r.id, uuid: r.uuid, name: r.name, skinUrl: r.skin_url, active: !!r.active, needsReauth: !!r.needs_reauth }
}

function rows(): Row[] {
  return db().prepare('SELECT * FROM accounts ORDER BY created_at').all() as unknown as Row[]
}

export function listAccounts(): Account[] {
  return rows().map(toAccount)
}

function changed(): Account[] {
  const list = listAccounts()
  broadcast('accounts:changed', list)
  return list
}

export function selectAccount(id: string): Account[] {
  transaction(() => {
    db().prepare('UPDATE accounts SET active = (id = ?)').run(id)
  })
  return changed()
}

export function removeAccount(id: string): Account[] {
  transaction(() => {
    const wasActive = db().prepare('SELECT active FROM accounts WHERE id = ?').get(id) as { active: number } | undefined
    db().prepare('DELETE FROM accounts WHERE id = ?').run(id)
    if (wasActive?.active) {
      db().prepare('UPDATE accounts SET active = 1 WHERE id = (SELECT id FROM accounts ORDER BY created_at LIMIT 1)').run()
    }
  })
  return changed()
}

function requireClientId(): string {
  const id = msClientId()
  if (!id) {
    throw new Error('Microsoft sign-in is not configured. Set an Azure client id in Settings → Advanced (see README).')
  }
  return id
}

/**
 * Opens Microsoft's sign-in page in an isolated window (no preload, throwaway session) and captures
 * the authorization code from the redirect. PKCE + state guard the code exchange.
 */
function promptForCode(clientId: string): Promise<{ code: string; verifier: string }> {
  const pkce = createPkce()
  const win = new BrowserWindow({
    width: 520,
    height: 700,
    title: 'Sign in with Microsoft',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      session: session.fromPartition(`auth-${randomUUID()}`),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
      if (!win.isDestroyed()) win.close()
    }
    const inspect = (url: string) => {
      if (!url.startsWith(REDIRECT_URI)) return false
      const params = new URL(url).searchParams
      const code = params.get('code')
      if (params.get('state') !== pkce.state) finish(() => reject(new Error('Sign-in response did not match the request.')))
      else if (code) finish(() => resolve({ code, verifier: pkce.verifier }))
      else finish(() => reject(new Error(params.get('error_description') ?? 'Sign-in was cancelled.')))
      return true
    }
    win.webContents.on('will-redirect', (e, url) => inspect(url) && e.preventDefault())
    win.webContents.on('will-navigate', (e, url) => inspect(url) && e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.on('closed', () => finish(() => reject(new Error('Sign-in window was closed.'))))
    win.loadURL(authorizeUrl(clientId, pkce)).catch(() => {
      /* navigation to the redirect URI is aborted on purpose */
    })
  })
}

async function save(session: MinecraftSession, msRefreshToken: string): Promise<Account> {
  const secrets = await seal({ msRefreshToken, mcAccessToken: session.accessToken })
  const { id, name, skinUrl } = session.profile
  const existing = db().prepare('SELECT id FROM accounts WHERE uuid = ?').get(id) as { id: string } | undefined
  const accountId = existing?.id ?? randomUUID()
  transaction(() => {
    db().prepare('UPDATE accounts SET active = 0').run()
    db()
      .prepare(
        `INSERT INTO accounts (id, uuid, name, skin_url, secrets, mc_expires_at, needs_reauth, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)
         ON CONFLICT(uuid) DO UPDATE SET name = excluded.name, skin_url = excluded.skin_url, secrets = excluded.secrets,
           mc_expires_at = excluded.mc_expires_at, needs_reauth = 0, active = 1`,
      )
      .run(accountId, id, name, skinUrl, secrets, session.expiresAt, Date.now())
  })
  changed()
  return listAccounts().find((a) => a.id === accountId)!
}

export async function login(): Promise<Account> {
  const clientId = requireClientId()
  const { code, verifier } = await promptForCode(clientId)
  const ms = await exchangeCode(clientId, code, verifier)
  const account = await save(await loginMinecraft(ms.accessToken), ms.refreshToken)
  logActivity('account', `Signed in as ${account.name}`)
  return account
}

export interface LaunchCredentials {
  name: string
  uuid: string
  accessToken: string
}

const refreshing = new Map<string, Promise<LaunchCredentials>>()

/** Returns a valid Minecraft token for the active account, refreshing through Microsoft when close to expiry. */
export async function activeCredentials(): Promise<LaunchCredentials> {
  const row = rows().find((r) => r.active)
  if (!row) throw new Error('Sign in with a Microsoft account to play.')
  if (row.needs_reauth) throw new Error(`Sign in to ${row.name} again to play.`)
  const secrets = await unseal(row.secrets)
  if (row.mc_expires_at - Date.now() > 5 * 60_000) {
    return { name: row.name, uuid: row.uuid, accessToken: secrets.mcAccessToken }
  }
  let job = refreshing.get(row.id)
  if (!job) {
    job = (async () => {
      try {
        const ms = await refreshMicrosoft(requireClientId(), secrets.msRefreshToken)
        const session = await loginMinecraft(ms.accessToken)
        await save(session, ms.refreshToken)
        return { name: session.profile.name, uuid: session.profile.id, accessToken: session.accessToken }
      } catch (e) {
        if (e instanceof ReauthRequiredError) {
          db().prepare('UPDATE accounts SET needs_reauth = 1 WHERE id = ?').run(row.id)
          changed()
        }
        throw e
      } finally {
        refreshing.delete(row.id)
      }
    })()
    refreshing.set(row.id, job)
  }
  return job
}
