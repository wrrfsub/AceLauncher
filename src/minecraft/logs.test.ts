import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLogParser, type ParsedLine } from './logs.ts'

test('parses log4j XML events split across chunks, mixed with plain lines', () => {
  const out: ParsedLine[] = []
  const p = createLogParser((l) => out.push(l))
  const event =
    '<log4j:Event logger="net.minecraft.client.Minecraft" timestamp="0" level="WARN" thread="Render thread">\n' +
    '  <log4j:Message><![CDATA[Something odd]]></log4j:Message>\n' +
    '  <log4j:Throwable><![CDATA[java.lang.Error: boom\n\tat a.b]]></log4j:Throwable>\n' +
    '</log4j:Event>\n'
  p.push('plain start\n' + event.slice(0, 40))
  p.push(event.slice(40) + 'ERROR plain tail')
  p.end()
  assert.equal(out[0]!.text, 'plain start')
  assert.match(out[1]!.text, /\[Render thread\/WARN\]: Something odd$/)
  assert.equal(out[1]!.level, 'warn')
  assert.deepEqual(out.slice(2).map((l) => l.text), ['java.lang.Error: boom', '\tat a.b', 'ERROR plain tail'])
  assert.equal(out[4]!.level, 'error')
})
