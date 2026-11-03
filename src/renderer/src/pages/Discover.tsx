import { motion } from 'motion/react'
import { Check, Download, ExternalLink, LoaderCircle, Package, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ContentKind, ContentSource, Instance, ProjectHit, ProjectType, SearchSort } from '@shared/types'
import { InstanceIcon } from '../components/InstanceIcon'
import { Button } from '../components/ui/Button'
import { Empty, Input, Segmented, Tabs } from '../components/ui/controls'
import { Select } from '../components/ui/Select'
import { invoke } from '../lib/ipc'
import { compact, versionLabel } from '../lib/format'
import { useApp, useFeatured } from '../state'
import { ToolbarActions } from '../components/Toolbar'

const TYPES: Array<{ value: ProjectType; label: string }> = [
  { value: 'mod', label: 'Mods' },
  { value: 'resourcepack', label: 'Resource packs' },
  { value: 'shader', label: 'Shaders' },
  { value: 'modpack', label: 'Modpacks' },
]
const PAGE = 20

export function Discover({ instanceId, type }: { instanceId?: string; type?: ProjectType }) {
  const { instances, info, act, navigate } = useApp()
  const featured = useFeatured()
  const [source, setSource] = useState<ContentSource>('modrinth')
  const [projectType, setProjectType] = useState<ProjectType>(type ?? 'mod')
  const [targetId, setTargetId] = useState<string | null>(instanceId ?? featured?.id ?? null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState<SearchSort>('relevance')
  const [hits, setHits] = useState<ProjectHit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const request = useRef(0)

  useEffect(() => {
    if (type) setProjectType(type)
    if (instanceId) setTargetId(instanceId)
  }, [type, instanceId])

  const target: Instance | null = projectType === 'modpack' ? null : (instances.find((i) => i.id === targetId) ?? null)
  const blocked = projectType === 'mod' && target?.loader === 'vanilla'

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const search = async (offset: number) => {
    const id = ++request.current
    setLoading(true)
    setError(null)
    try {
      const res = await invoke('content:search', {
        source,
        projectType,
        query: debounced,
        minecraft: target?.minecraft ?? null,
        loader: target?.loader ?? null,
        sort,
        offset,
        limit: PAGE,
      })
      if (id !== request.current) return
      setHits((prev) => (offset ? [...prev, ...res.hits] : res.hits))
      setTotal(res.total)
    } catch (e) {
      if (id === request.current) setError((e as Error).message)
    } finally {
      if (id === request.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (blocked) {
      setHits([])
      return
    }
    void search(0)
  }, [source, projectType, debounced, sort, target?.id, blocked])

  // Know what's already in the target instance so results can say "Installed".
  useEffect(() => {
    if (!target || projectType === 'modpack') return setInstalled(new Set())
    invoke('content:list', { instanceId: target.id, kind: projectType as ContentKind }).then(
      (list) => setInstalled(new Set(list.filter((c) => c.source === source && c.projectId).map((c) => c.projectId!))),
      () => setInstalled(new Set()),
    )
  }, [target?.id, projectType, source])

  const install = async (hit: ProjectHit) => {
    setInstalling((s) => new Set(s).add(hit.id))
    if (projectType === 'modpack') {
      const inst = await act(() => invoke('modpack:install', { projectId: hit.id }), `${hit.title} installed`)
      if (inst) navigate({ page: 'instance', id: inst.id })
    } else if (target) {
      const list = await act(() => invoke('content:install', { instanceId: target.id, source, projectId: hit.id, kind: projectType }), `Added ${hit.title}`)
      if (list) setInstalled(new Set(list.filter((c) => c.source === source && c.projectId).map((c) => c.projectId!)))
    }
    setInstalling((s) => {
      const n = new Set(s)
      n.delete(hit.id)
      return n
    })
  }

  const instanceOptions = useMemo(
    () => instances.map((i) => ({ value: i.id, label: i.name, hint: versionLabel(i), icon: <InstanceIcon inst={i} size={18} /> })),
    [instances],
  )

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-5">
      <ToolbarActions>
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { value: 'modrinth', label: 'Modrinth' },
            { value: 'curseforge', label: 'CurseForge', disabled: !info.curseforgeEnabled },
          ]}
        />
      </ToolbarActions>

      <Tabs value={projectType} onChange={setProjectType} tabs={TYPES} />

      <div className="mt-4 flex items-center gap-2">
        <Input
          className="flex-1"
          placeholder={`Search ${TYPES.find((t) => t.value === projectType)!.label.toLowerCase()}`}
          leading={<Search className="size-3.5" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {projectType !== 'modpack' && (
          <Select className="w-64" label="Install into" placeholder="Pick an instance" value={target?.id ?? null} options={instanceOptions} onChange={setTargetId} />
        )}
        <Select
          className="w-40"
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'relevance', label: 'Relevance' },
            { value: 'downloads', label: 'Downloads' },
            { value: 'updated', label: 'Recently updated' },
            { value: 'newest', label: 'Newest' },
          ]}
        />
      </div>
      {target && projectType !== 'modpack' && (
        <p className="mt-2 text-xs text-text-3">
          Showing results compatible with <span className="text-text-2">{versionLabel(target)}</span>
        </p>
      )}
      {!info.curseforgeEnabled && source === 'modrinth' && (
        <p className="mt-1 text-xs text-text-3">CurseForge needs an API key. Add one in Settings → Advanced.</p>
      )}

      <div className="mt-5">
        {blocked ? (
          <Empty icon={<Package className="size-5" />} title="Vanilla instances can't load mods">
            Pick an instance with Fabric, Forge, NeoForge or Quilt, or create one.
          </Empty>
        ) : projectType !== 'modpack' && !target ? (
          <Empty icon={<Package className="size-5" />} title="Pick an instance to install into">
            Results are filtered to its Minecraft version and loader.
          </Empty>
        ) : error ? (
          <Empty icon={<Search className="size-5" />} title="Search failed">
            <span className="selectable">{error}</span>
          </Empty>
        ) : !loading && hits.length === 0 ? (
          <Empty icon={<Search className="size-5" />} title="No results" />
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {hits.map((h, i) => (
                <motion.li
                  key={`${h.source}:${h.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: (i % PAGE) * 0.015 }}
                  className="flex items-center gap-3 rounded-[10px] border border-line bg-surface p-2.5 transition-colors hover:border-line-strong"
                >
                  {h.iconUrl ? (
                    <img src={h.iconUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg bg-surface-3 object-cover" />
                  ) : (
                    <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-3 text-text-3">
                      <Package className="size-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2">
                      <span className="truncate text-[13px] font-medium">{h.title}</span>
                      <span className="shrink-0 text-xs text-text-3">by {h.author}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-2">{h.description}</p>
                    <p className="mt-1 flex items-center gap-3 text-[11px] text-text-3">
                      <span className="flex items-center gap-1">
                        <Download className="size-3" />
                        {compact(h.downloads)}
                      </span>
                      {h.categories.slice(0, 4).map((c) => (
                        <span key={c} className="capitalize">
                          {c}
                        </span>
                      ))}
                    </p>
                  </div>
                  <a href={h.url} target="_blank" rel="noreferrer" className="text-text-3 hover:text-text" aria-label={`Open ${h.title} on the web`}>
                    <ExternalLink className="size-4" />
                  </a>
                  {installed.has(h.id) ? (
                    <Button size="sm" variant="secondary" icon={Check} loading={installing.has(h.id)} onClick={() => install(h)} title="Reinstall the newest compatible version">
                      Installed
                    </Button>
                  ) : (
                    <Button size="sm" loading={installing.has(h.id)} icon={Download} onClick={() => install(h)}>
                      Install
                    </Button>
                  )}
                </motion.li>
              ))}
            </ul>
            <div className="mt-5 flex justify-center">
              {loading ? (
                <LoaderCircle className="size-5 animate-spin text-text-3" />
              ) : (
                hits.length < total && (
                  <Button variant="ghost" onClick={() => search(hits.length)}>
                    Load more
                  </Button>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
