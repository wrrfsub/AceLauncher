import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { connectDiscord, createDecoder, encode, ipcPaths } from './discordIpc.ts'

/** A fake Discord client socket that speaks just enough of the protocol. */
function fakeDiscord(path: string, { clientId, received }: { clientId: string; received: unknown[] }) {
  return createServer((sock) => {
    sock.on(
      'data',
      createDecoder((op, data) => {
        if (op === 0) {
          if (data.client_id !== clientId) return void sock.end(encode(2, { code: 4000, message: 'Invalid Client ID' }))
          // Split the READY frame across two writes to exercise reassembly.
          const ready = encode(1, { cmd: 'DISPATCH', evt: 'READY', data: { user: { username: 'steve', global_name: 'Steve' } } })
          sock.write(ready.subarray(0, 5))
          setTimeout(() => sock.write(ready.subarray(5)), 5)
        } else if (op === 1) {
          received.push(data)
          sock.write(encode(1, { cmd: data.cmd, evt: null, nonce: data.nonce, data: {} }))
        }
      }),
    )
  }).listen(path)
}

test('handshakes, sets and clears activity, and reports bad client ids', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ace-discord-'))
  const path = join(dir, 'discord-ipc-0')
  const received: any[] = []
  const server = fakeDiscord(path, { clientId: '123456789012345678', received })
  try {
    const conn = await connectDiscord('123456789012345678', [join(dir, 'missing'), path])
    assert.equal(conn.user, 'Steve')
    await conn.setActivity({ details: 'Playing Survival', timestamps: { start: 1 } })
    await conn.setActivity(null)
    assert.equal(received[0].cmd, 'SET_ACTIVITY')
    assert.equal(received[0].args.activity.details, 'Playing Survival')
    assert.equal(received[0].args.pid, process.pid)
    assert.equal('activity' in received[1].args, false)
    conn.close()

    await assert.rejects(connectDiscord('999', [path]), /Invalid Client ID/)
    await assert.rejects(connectDiscord('999', [join(dir, 'nope')]), /not running/)
  } finally {
    server.close()
  }
})

test('ipcPaths covers pipes on Windows and sandboxed installs on Linux', () => {
  assert.equal(ipcPaths('win32', {})[0], '\\\\?\\pipe\\discord-ipc-0')
  const linux = ipcPaths('linux', { XDG_RUNTIME_DIR: '/run/user/1000' })
  assert.equal(linux[0], '/run/user/1000/discord-ipc-0')
  assert.ok(linux.includes('/run/user/1000/app/com.discordapp.Discord/discord-ipc-0'))
})
