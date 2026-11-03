/** Splits a user-typed argument string like a shell would for quoting purposes: `-Da="x y" -Xss2m`. */
export function splitArgs(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  let started = false
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (/\s/.test(ch)) {
      if (started) out.push(cur)
      cur = ''
      started = false
    } else {
      cur += ch
      started = true
    }
  }
  if (quote) throw new Error('Unclosed quote in arguments')
  if (started) out.push(cur)
  return out
}
