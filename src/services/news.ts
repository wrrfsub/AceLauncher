import { BRANDING } from '../shared/branding.ts'
import type { NewsItem } from '../shared/types.ts'
import { getJson } from '../utils/http.ts'

const MOJANG = 'https://launchercontent.mojang.com'

interface PatchNotes {
  entries: Array<{
    id: string
    title: string
    version: string
    type: string
    date: string
    shortText?: string
    image?: { url: string }
  }>
}

let cache: { at: number; items: NewsItem[] } | null = null

/** Minecraft Java patch notes from Mojang's launcher feed, plus optional launcher announcements. */
export async function listNews(): Promise<NewsItem[]> {
  if (cache && Date.now() - cache.at < 15 * 60_000) return cache.items

  const [notes, announcements] = await Promise.all([
    getJson<PatchNotes>(`${MOJANG}/v2/javaPatchNotes.json`),
    BRANDING.announcementsUrl ? getJson<NewsItem[]>(BRANDING.announcementsUrl).catch(() => []) : Promise.resolve([]),
  ])

  const items: NewsItem[] = [
    ...announcements.map((a) => ({ ...a, tag: 'Launcher' })),
    ...notes.entries.slice(0, 12).map((e) => ({
      id: e.id,
      title: e.title,
      summary: e.shortText ?? '',
      imageUrl: e.image ? `${MOJANG}${e.image.url}` : null,
      // minecraft.net article slugs aren't predictable; the wiki search lands on the right changelog.
      url: `https://minecraft.wiki/?search=${encodeURIComponent(`Java Edition ${e.version}`)}`,
      date: e.date,
      tag: e.type === 'release' ? 'Release' : 'Snapshot',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  cache = { at: Date.now(), items }
  return items
}
