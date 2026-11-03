import { randomUUID } from 'node:crypto'
import { connect } from 'node:net'
import { join } from 'node:path'

/**
 * Minimal client for Discord's local RPC socket, enough for Rich Presence.
 * Frames are: int32le opcode, int32le length, JSON body.
 * https://discord.com/developers/docs/topics/rpc
 */
const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 } as const

export interface Activity {
  details?: string
  state?: string
  timestamps?: { start?: number; end?: number }
  assets?: { large_image?: string; large_text?: string; small_image?: string; small_text?: string }
  buttons?: Array<{ label: string; url: string }>
}

export interface DiscordConnection {
  /** Display name of the Discord user the client is logged in as. */
  user: string | null
  setActivity(activity: Activity | null): Promise<void>
  close(): void
  onClose(listener: () => void): void
}

/** Where Discord (and its Flatpak/Snap/Vesktop variants) put the socket, in the order to try. */
export function ipcPaths(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env): string[] {
  const ids = Array.from({ length: 10 }, (_, i) => `discord-ipc-${i}`)
  if (platform === 'win32') return ids.map((id) => `\\\\?\\pipe\\${id}`)
  const bases = [env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, '/tmp'].filter((b): b is string => !!b)
  const subdirs = ['', 'app/com.discordapp.Discord', 'app/com.discordapp.DiscordCanary', 'snap.discord', '.flatpak/dev.vencord.Vesktop/xdg-run']
  const paths = bases.flatMap((base) => subdirs.flatMap((sub) => ids.map((id) => join(base, sub, id))))
  return [...new Set(paths)]
}

export function encode(op: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(8)
  header.writeInt32LE(op, 0)
  header.writeInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

/** Reassembles frames that may arrive split or batched across socket chunks. */
export function createDecoder(onFrame: (op: number, data: any) => void): (chunk: Buffer) => void {
  let buf = Buffer.alloc(0)
  return (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 8) {
      const len = buf.readInt32LE(4)
      if (buf.length < 8 + len) return
      const op = buf.readInt32LE(0)
      const body = buf.subarray(8, 8 + len).toString('utf8')
      buf = buf.subarray(8 + len)
      let data: unknown = null
      try {
        data = JSON.parse(body)
      } catch {
        /* ignore malformed frames */
      }
      onFrame(op, data)
    }
  }
}

function open(path: string, clientId: string): Promise<DiscordConnection> {
  return new Promise((resolve, reject) => {
    const sock = connect(path)
    const pending = new Map<string, { resolve(): void; reject(e: Error): void }>()
    const closeListeners: Array<() => void> = []
    let ready = false
    const timer = setTimeout(() => {
      sock.destroy()
      reject(new Error('Discord did not answer the handshake'))
    }, 5000)

    const connection = (user: { global_name?: string; username?: string } | undefined): DiscordConnection => ({
      user: user?.global_name || user?.username || null,
      setActivity(activity) {
        const nonce = randomUUID()
        return new Promise((res, rej) => {
          pending.set(nonce, { resolve: res, reject: rej })
          sock.write(encode(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, ...(activity ? { activity } : {}) }, nonce }))
        })
      },
      close() {
        sock.destroy()
      },
      onClose(listener) {
        closeListeners.push(listener)
      },
    })

    sock.on('connect', () => sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: clientId })))
    sock.on(
      'data',
      createDecoder((op, data) => {
        if (op === OP.PING) {
          sock.write(encode(OP.PONG, data))
        } else if (op === OP.CLOSE) {
          // e.g. { code: 4000, message: 'Invalid Client ID' }
          if (!ready) {
            clearTimeout(timer)
            reject(new Error(`Discord refused the connection: ${data?.message ?? 'unknown reason'}`))
          }
          sock.destroy()
        } else if (op === OP.FRAME) {
          if (!ready && data?.evt === 'READY') {
            ready = true
            clearTimeout(timer)
            resolve(connection(data.data?.user))
          } else if (data?.nonce && pending.has(data.nonce)) {
            const p = pending.get(data.nonce)!
            pending.delete(data.nonce)
            if (data.evt === 'ERROR') p.reject(new Error(data.data?.message ?? 'Discord rejected the request'))
            else p.resolve()
          }
        }
      }),
    )
    sock.on('error', (e) => {
      clearTimeout(timer)
      if (!ready) reject(e)
    })
    sock.on('close', () => {
      for (const p of pending.values()) p.reject(new Error('Discord connection closed'))
      pending.clear()
      if (ready) closeListeners.forEach((l) => l())
    })
  })
}

/** Connects to the first Discord client that answers. Rejects quickly when Discord isn't running. */
export async function connectDiscord(clientId: string, paths: string[] = ipcPaths()): Promise<DiscordConnection> {
  let refused: Error | null = null
  for (const path of paths) {
    try {
      return await open(path, clientId)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ECONNREFUSED') refused ??= e as Error
    }
  }
  throw refused ?? new Error('Discord is not running')
}
