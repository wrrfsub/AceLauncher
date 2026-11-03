export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface ParsedLine {
  level: LogLevel
  text: string
}

const EVENT_START = '<log4j:Event'
const EVENT_END = '</log4j:Event>'

function levelOf(raw: string): LogLevel {
  const l = raw.toUpperCase()
  if (l === 'WARN') return 'warn'
  if (l === 'ERROR' || l === 'FATAL') return 'error'
  if (l === 'DEBUG' || l === 'TRACE') return 'debug'
  return 'info'
}

function guessLevel(line: string): LogLevel {
  if (/\b(ERROR|FATAL|SEVERE)\b|Exception\b|^\s+at /.test(line)) return 'error'
  if (/\bWARN(ING)?\b/.test(line)) return 'warn'
  if (/\bDEBUG\b/.test(line)) return 'debug'
  return 'info'
}

const attr = (xml: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(xml)?.[1]
const cdata = (xml: string, tag: string) =>
  new RegExp(`<log4j:${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></log4j:${tag}>`).exec(xml)?.[1]

function parseEvent(xml: string): ParsedLine[] {
  const level = levelOf(attr(xml, 'level') ?? 'INFO')
  const ts = Number(attr(xml, 'timestamp'))
  const time = Number.isFinite(ts) ? new Date(ts).toTimeString().slice(0, 8) : '--:--:--'
  const head = `[${time}] [${attr(xml, 'thread') ?? 'main'}/${(attr(xml, 'level') ?? 'INFO').toUpperCase()}]: `
  const message = (cdata(xml, 'Message') ?? '').trimEnd()
  const throwable = cdata(xml, 'Throwable')?.trimEnd()
  const lines = message.split('\n').map((t, i) => ({ level, text: i === 0 ? head + t : t }))
  if (throwable) lines.push(...throwable.split('\n').map((text) => ({ level: 'error' as const, text })))
  return lines
}

/**
 * Minecraft's log4j config (from the version JSON) prints XML events to stdout; older versions and
 * most mod loaders print plain text. Feed raw chunks in, get readable lines out.
 */
export function createLogParser(emit: (line: ParsedLine) => void): { push(chunk: string): void; end(): void } {
  let buf = ''
  const drain = (final: boolean) => {
    for (;;) {
      if (buf.trimStart().startsWith(EVENT_START)) {
        const end = buf.indexOf(EVENT_END)
        if (end === -1) {
          if (!final) return
          buf.split('\n').forEach((text) => text && emit({ level: guessLevel(text), text }))
          buf = ''
          return
        }
        parseEvent(buf.slice(0, end)).forEach(emit)
        buf = buf.slice(end + EVENT_END.length).replace(/^\r?\n/, '')
        continue
      }
      const nl = buf.indexOf('\n')
      const start = buf.indexOf(EVENT_START)
      if (start > 0 && (nl === -1 || start < nl)) {
        const text = buf.slice(0, start).trimEnd()
        if (text) emit({ level: guessLevel(text), text })
        buf = buf.slice(start)
        continue
      }
      if (nl === -1) {
        if (final && buf) emit({ level: guessLevel(buf), text: buf })
        if (final) buf = ''
        return
      }
      const text = buf.slice(0, nl).replace(/\r$/, '')
      buf = buf.slice(nl + 1)
      if (text) emit({ level: guessLevel(text), text })
    }
  }
  return {
    push(chunk) {
      buf += chunk
      drain(false)
    },
    end() {
      drain(true)
    },
  }
}
