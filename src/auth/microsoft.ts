import { createHash, randomBytes } from 'node:crypto'
import { getJson, HttpError, postJson } from '../utils/http.ts'

/**
 * Microsoft → Xbox Live → XSTS → Minecraft Services sign-in chain.
 * See https://minecraft.wiki/w/Microsoft_authentication for the protocol.
 *
 * Requires an Azure app registration (public client, personal Microsoft accounts) whose client id
 * Mojang has approved for the Minecraft Services API — see README "Microsoft sign-in".
 */

const AUTHORIZE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
/** Azure's built-in redirect for desktop apps. Register it under "Mobile and desktop applications". */
export const REDIRECT_URI = 'https://login.microsoftonline.com/common/oauth2/nativeclient'
const SCOPE = 'XboxLive.signin offline_access'

export interface Pkce {
  verifier: string
  challenge: string
  state: string
}

export function createPkce(): Pkce {
  const verifier = randomBytes(32).toString('base64url')
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: randomBytes(16).toString('base64url'),
  }
}

export function authorizeUrl(clientId: string, pkce: Pkce): string {
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state: pkce.state,
    prompt: 'select_account',
  }).toString()
  return url.toString()
}

export interface MsTokens {
  accessToken: string
  refreshToken: string
}

interface TokenResponse {
  access_token: string
  refresh_token: string
}

async function tokenRequest(form: Record<string, string>): Promise<MsTokens> {
  try {
    const res = await postJson<TokenResponse>(TOKEN_URL, { form })
    return { accessToken: res.access_token, refreshToken: res.refresh_token }
  } catch (e) {
    if (e instanceof HttpError) {
      const body = safeJson(e.body) as { error?: string; error_description?: string } | null
      if (body?.error === 'invalid_grant') throw new ReauthRequiredError('Your Microsoft session expired. Sign in again.')
      throw new Error(`Microsoft sign-in failed: ${body?.error_description?.split('\r\n')[0] ?? e.message}`)
    }
    throw e
  }
}

export function exchangeCode(clientId: string, code: string, verifier: string): Promise<MsTokens> {
  return tokenRequest({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    scope: SCOPE,
  })
}

export function refreshMicrosoft(clientId: string, refreshToken: string): Promise<MsTokens> {
  return tokenRequest({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken, scope: SCOPE })
}

export class ReauthRequiredError extends Error {
  override name = 'ReauthRequiredError'
}

export interface MinecraftSession {
  accessToken: string
  expiresAt: number
  profile: { id: string; name: string; skinUrl: string | null }
}

interface XboxResponse {
  Token: string
  DisplayClaims: { xui: Array<{ uhs: string }> }
}

const XSTS_ERRORS: Record<string, string> = {
  '2148916233': "This Microsoft account doesn't have an Xbox profile yet. Sign in once at xbox.com, then try again.",
  '2148916235': 'Xbox Live is not available in your country/region.',
  '2148916236': 'This account needs adult verification on xbox.com (South Korea).',
  '2148916237': 'This account needs adult verification on xbox.com (South Korea).',
  '2148916238': 'This is a child account. An adult must add it to a Microsoft family before it can play.',
}

/** Turns a Microsoft access token into a Minecraft session, verifying the account owns Java Edition. */
export async function loginMinecraft(msAccessToken: string): Promise<MinecraftSession> {
  const xbl = await postJson<XboxResponse>('https://user.auth.xboxlive.com/user/authenticate', {
    json: {
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    },
  })

  let xsts: XboxResponse
  try {
    xsts = await postJson<XboxResponse>('https://xsts.auth.xboxlive.com/xsts/authorize', {
      json: {
        Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT',
      },
    })
  } catch (e) {
    const xerr = e instanceof HttpError ? String((safeJson(e.body) as { XErr?: number } | null)?.XErr ?? '') : ''
    throw new Error(XSTS_ERRORS[xerr] ?? `Xbox Live authorization failed (${(e as Error).message})`)
  }

  const uhs = xsts.DisplayClaims.xui[0]?.uhs
  if (!uhs) throw new Error('Xbox Live returned no user hash')

  let mc: { access_token: string; expires_in: number }
  try {
    mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
      json: { identityToken: `XBL3.0 x=${uhs};${xsts.Token}` },
    })
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) {
      throw new Error(
        "Minecraft rejected this launcher's Azure app. New client ids must be approved by Mojang first: https://aka.ms/mce-reviewappid",
      )
    }
    throw e
  }
  const auth = { Authorization: `Bearer ${mc.access_token}` }

  const entitlements = await getJson<{ items?: Array<{ name: string }> }>('https://api.minecraftservices.com/entitlements/mcstore', {
    headers: auth,
  })
  const owns = entitlements.items?.some((i) => i.name === 'game_minecraft' || i.name === 'product_minecraft')

  let profile: { id: string; name: string; skins?: Array<{ state: string; url: string }> }
  try {
    profile = await getJson('https://api.minecraftservices.com/minecraft/profile', { headers: auth })
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      throw new Error(
        owns
          ? 'This account owns Minecraft but has no profile yet. Launch the official launcher once to pick a username.'
          : "This Microsoft account doesn't own Minecraft: Java Edition.",
      )
    }
    throw e
  }
  // Game Pass accounts may have an empty mcstore list but still a valid profile; the profile is the real proof.
  return {
    accessToken: mc.access_token,
    expiresAt: Date.now() + mc.expires_in * 1000,
    profile: {
      id: profile.id,
      name: profile.name,
      skinUrl: profile.skins?.find((s) => s.state === 'ACTIVE')?.url ?? null,
    },
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

