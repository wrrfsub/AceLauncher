import assert from 'node:assert/strict'
import { test } from 'node:test'
import { packTarget, safeJoin } from './mrpack.ts'

test('safeJoin blocks path traversal from pack files', () => {
  assert.equal(safeJoin('/game/inst', 'mods/a.jar'), '/game/inst/mods/a.jar')
  assert.throws(() => safeJoin('/game/inst', '../escape.jar'))
  assert.throws(() => safeJoin('/game/inst', '/etc/passwd'))
  assert.throws(() => safeJoin('/game/inst', 'mods/../../inst2/x'))
})

test('packTarget picks the loader from dependencies', () => {
  const base = { formatVersion: 1, game: 'minecraft', name: 'p', versionId: '1', files: [] }
  assert.deepEqual(packTarget({ ...base, dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.0' } }), {
    minecraft: '1.21.1',
    loader: 'fabric',
    loaderVersion: '0.16.0',
  })
  assert.equal(packTarget({ ...base, dependencies: { minecraft: '1.20.1' } }).loader, 'vanilla')
  assert.throws(() => packTarget({ ...base, dependencies: {} }))
})
