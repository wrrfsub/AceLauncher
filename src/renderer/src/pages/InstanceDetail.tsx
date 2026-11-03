import { AnimatePresence, motion } from 'motion/react'
import { Compass, FolderOpen, Package, SquareTerminal, Trash2, Wrench } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ContentKind, Instance, InstancePatch, InstalledContent, JavaRuntime } from '@shared/types'
import { InstanceIcon } from '../components/InstanceIcon'
import { PlayButton } from '../components/PlayButton'
import { Button, IconButton } from '../components/ui/Button'
import { Badge, Empty, Input, Row, Segmented, Slider, Switch, Tabs } from '../components/ui/controls'
import { Dialog } from '../components/ui/Dialog'
import { Select } from '../components/ui/Select'
import { invoke } from '../lib/ipc'
import { ago, bytes, duration, LOADER_NAMES } from '../lib/format'
import { useApp, useInstancePhase } from '../state'

const KIND_LABEL: Record<ContentKind, string> = { mod: 'Mods', resourcepack: 'Resource packs', shader: 'Shaders' }
const KIND_DIR = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' } as const

export function InstanceDetail({ id, tab: initialTab }: { id: string; tab?: 'content' | 'settings' }) {
  const { instances, navigate, act } = useApp()
  const inst = instances.find((i) => i.id === id)
  const [tab, setTab] = useState<'content' | 'settings'>(initialTab ?? 'content')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const phase = useInstancePhase(inst ?? null)
  const busy = phase.kind !== 'ready' && phase.kind !== 'not-installed'

  useEffect(() => setTab(initialTab ?? 'content'), [id, initialTab])

  if (!inst) {
    return <Empty icon={<Package className="size-5" />} title="This instance no longer exists" />
  }

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-5">
      <div className="flex items-center gap-4">
        <InstanceIcon inst={inst} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{inst.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-2">
            <Badge>Minecraft {inst.minecraft}</Badge>
            {inst.loader !== 'vanilla' && (
              <Badge>
                {LOADER_NAMES[inst.loader]} {inst.loaderVersion}
              </Badge>
            )}
            <span className="ml-1 text-text-3">{inst.lastPlayedAt ? `${duration(inst.playTime)} played, last ${ago(inst.lastPlayedAt)}` : 'Not played yet'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <IconButton icon={FolderOpen} label="Open game folder" onClick={() => act(() => invoke('instances:openFolder', { id }))} />
          <IconButton icon={SquareTerminal} label="Console" onClick={() => navigate({ page: 'console', instanceId: id })} />
          <IconButton
            icon={Wrench}
            label="Repair: re-check every file"
            disabled={busy}
            onClick={() => act(() => invoke('instances:repair', id), 'Instance repaired')}
          />
          <IconButton icon={Trash2} label="Delete instance" disabled={busy} onClick={() => setConfirmDelete(true)} className="hover:text-danger" />
          <PlayButton inst={inst} className="ml-1.5 min-w-[108px]" />
        </div>
      </div>

      <div className="mt-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'content', label: 'Content' },
            { value: 'settings', label: 'Settings' },
          ]}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="pt-4">
          {tab === 'content' ? <ContentTab inst={inst} /> : <SettingsTab inst={inst} />}
        </motion.div>
      </AnimatePresence>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${inst.name}?`}
        description="Its worlds, mods, screenshots and settings are permanently removed. Shared game files stay."
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={async () => {
                setConfirmDelete(false)
                if ((await act(() => invoke('instances:delete', id), 'Instance deleted')) !== undefined) navigate({ page: 'instances' })
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="font-mono text-xs break-all text-text-3 selectable">{inst.gameDir}</p>
      </Dialog>
    </div>
  )
}

function ContentTab({ inst }: { inst: Instance }) {
  const { act, navigate, tasks } = useApp()
  const kinds: ContentKind[] = inst.loader === 'vanilla' ? ['resourcepack', 'shader'] : ['mod', 'resourcepack', 'shader']
  const [kind, setKind] = useState<ContentKind>(kinds[0]!)
  const [items, setItems] = useState<InstalledContent[] | null>(null)

  const load = useCallback(() => invoke('content:list', { instanceId: inst.id, kind }).then(setItems, () => setItems([])), [inst.id, kind])
  useEffect(() => {
    setItems(null)
    void load()
  }, [load])
  // Re-read when a content task for this instance finishes.
  const doneCount = tasks.filter((t) => t.instanceId === inst.id && t.kind === 'content' && t.state === 'done').length
  useEffect(() => {
    if (doneCount) void load()
  }, [doneCount])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Segmented value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => act(() => invoke('instances:openFolder', { id: inst.id, sub: KIND_DIR[kind] }))}>
            Open folder
          </Button>
          <Button size="sm" variant="primary" icon={Compass} onClick={() => navigate({ page: 'discover', instanceId: inst.id, type: kind })}>
            Browse {KIND_LABEL[kind].toLowerCase()}
          </Button>
        </div>
      </div>

      <div className="rounded-[10px] border border-line bg-surface">
        {items === null ? (
          <div className="h-40 animate-pulse" />
        ) : items.length === 0 ? (
          <Empty icon={<Package className="size-5" />} title={`No ${KIND_LABEL[kind].toLowerCase()} yet`}>
            Browse Modrinth or CurseForge, or drop files into the folder.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((c) => (
              <li key={c.fileName} className="flex items-center gap-3 px-3 py-2">
                {c.iconUrl ? (
                  <img src={c.iconUrl} alt="" className="size-8 rounded-md object-cover" loading="lazy" />
                ) : (
                  <div className="grid size-8 place-items-center rounded-md bg-surface-3 text-text-3">
                    <Package className="size-4" />
                  </div>
                )}
                <div className={`min-w-0 flex-1 ${c.enabled ? '' : 'opacity-50'}`}>
                  <p className="truncate text-[13px] font-medium">{c.title ?? c.fileName}</p>
                  <p className="truncate text-[11px] text-text-3">
                    {c.title ? c.fileName : ''}
                    {c.versionNumber ? `${c.title ? ', ' : ''}${c.versionNumber}` : ''}
                  </p>
                </div>
                {c.source && <Badge>{c.source === 'modrinth' ? 'Modrinth' : 'CurseForge'}</Badge>}
                <span className="w-16 text-right text-[11px] text-text-3 tabular-nums">{c.size ? bytes(c.size) : ''}</span>
                <Switch
                  checked={c.enabled}
                  label={c.enabled ? `Disable ${c.fileName}` : `Enable ${c.fileName}`}
                  onChange={(enabled) =>
                    act(() => invoke('content:toggle', { instanceId: inst.id, kind, fileName: c.fileName, enabled })).then((r) => r && setItems(r))
                  }
                />
                <IconButton
                  icon={Trash2}
                  size="sm"
                  label={`Remove ${c.fileName}`}
                  className="hover:text-danger"
                  onClick={() => act(() => invoke('content:remove', { instanceId: inst.id, kind, fileName: c.fileName })).then((r) => r && setItems(r))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function SettingsTab({ inst }: { inst: Instance }) {
  const { act, settings, info } = useApp()
  const [java, setJava] = useState<JavaRuntime[]>([])
  const [name, setName] = useState(inst.name)
  const [jvmArgs, setJvmArgs] = useState(inst.jvmArgs)
  const [gameArgs, setGameArgs] = useState(inst.gameArgs)
  const [maxMemory, setMaxMemory] = useState(inst.maxMemory ?? settings.maxMemory)

  useEffect(() => {
    invoke('java:list', false).then(setJava, () => {})
  }, [])

  const save = (patch: InstancePatch) => act(() => invoke('instances:update', { id: inst.id, patch }))
  const memoryCap = Math.max(4096, Math.floor(info.totalMemory / 1024 / 1024 / 512) * 512)

  const javaOptions = [
    { value: 'auto', label: 'Automatic', hint: 'matches the version' },
    ...java.map((j) => ({ value: j.path, label: `Java ${j.majorVersion}`, hint: j.managed ? 'downloaded by Ace' : j.path })),
    ...(inst.javaPath && !java.some((j) => j.path === inst.javaPath) ? [{ value: inst.javaPath, label: inst.javaPath }] : []),
    { value: 'browse', label: 'Browse…' },
  ]

  return (
    <div className="max-w-[720px] divide-y divide-line">
      <Row title="Name">
        <Input className="w-72" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== inst.name && save({ name })} />
      </Row>

      <Row title="Memory" description={inst.maxMemory === null ? `Using the default (${settings.maxMemory} MB)` : 'Overrides the default for this instance'}>
        <Switch
          label="Override memory"
          checked={inst.maxMemory !== null}
          onChange={(on) => save(on ? { maxMemory } : { maxMemory: null, minMemory: null })}
        />
      </Row>
      {inst.maxMemory !== null && (
        <div className="flex items-center gap-4 pb-4">
          <Slider label="Maximum memory" min={1024} max={memoryCap} step={512} value={maxMemory} onChange={setMaxMemory} />
          <span className="w-20 text-right text-xs tabular-nums">{(maxMemory / 1024).toFixed(1)} GB</span>
          <Button size="sm" disabled={maxMemory === inst.maxMemory} onClick={() => save({ maxMemory })}>
            Apply
          </Button>
        </div>
      )}

      <Row title="Java" description="Automatic picks or downloads the Java this version needs.">
        <Select
          className="w-72"
          label="Java runtime"
          value={inst.javaPath ?? 'auto'}
          options={javaOptions}
          onChange={async (v) => {
            if (v === 'browse') {
              const path = await act(() => invoke('dialog:pickJava'))
              if (path) void save({ javaPath: path })
            } else void save({ javaPath: v === 'auto' ? null : v })
          }}
        />
      </Row>

      <Row title="JVM arguments" description="Added after the global arguments, e.g. -XX:+UseZGC">
        <Input className="w-72 font-mono" value={jvmArgs} onChange={(e) => setJvmArgs(e.target.value)} onBlur={() => jvmArgs !== inst.jvmArgs && save({ jvmArgs })} />
      </Row>
      <Row title="Game arguments" description="Passed to Minecraft, e.g. --width 1920 --height 1080">
        <Input className="w-72 font-mono" value={gameArgs} onChange={(e) => setGameArgs(e.target.value)} onBlur={() => gameArgs !== inst.gameArgs && save({ gameArgs })} />
      </Row>

      <Row title="Game directory" description={<span className="font-mono break-all selectable">{inst.gameDir}</span>}>
        <Button size="sm" icon={FolderOpen} onClick={() => act(() => invoke('instances:openFolder', { id: inst.id }))}>
          Open
        </Button>
      </Row>
      <p className="pt-4 text-xs text-text-3">Changes apply on the next launch.</p>
    </div>
  )
}
