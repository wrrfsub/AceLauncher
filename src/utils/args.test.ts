import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitArgs } from './args.ts'

test('splitArgs handles quotes and whitespace', () => {
  assert.deepEqual(splitArgs('  -Xss2m   -Dfoo="a b" \'-Dbar=c d\' ""  '), ['-Xss2m', '-Dfoo=a b', '-Dbar=c d', ''])
  assert.deepEqual(splitArgs(''), [])
  assert.throws(() => splitArgs('-Da="oops'))
})
