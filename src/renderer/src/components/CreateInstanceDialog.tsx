import { useEffect, useMemo, useState } from 'react'
import type { Loader, LoaderVersion, McVersion } from '@shared/types'
import { LOADERS } from '@shared/types'
import { invoke } from '../lib/ipc'
import { LOADER_NAMES } from '../lib/format'
import { useApp } from '../state'
import { Button } from './ui/Button'
import { Segmented, Switch } from './ui/controls'
import { Dialog, Field } from './ui/Dialog'
import { Input } from './ui/controls'
import { Select } from './ui/Select'

export function CreateInstanceDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { act, navigate } = useApp()
  const [versions, setVersions] = useState<McVersion[] | null>(null)
  const [snapshots, setSnapshots] = useState(false)
  const [minecraft, setMinecraft] = useState<string | null>(null)
  const [loader, setLoader] = useState<Loader>('vanilla')
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[] | null>(null)
  const [loaderVersion, setLoaderVersion] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || versions) return
    act(() => invoke('versions:minecraft')).then((v) => {
      if (!v) return
      setVersions(v)
      setMinecraft((m) => m ?? v.find((x) => x.type === 'release')?.id ?? null)
    })
  }, [open])

  useEffect(() => {
    setLoaderVersions(null)
    setLoaderVersion(null)
    if (loader === 'vanilla' || !minecraft) return
    let stale = false
    act(() => invoke('versions:loader', { loader, minecraft })).then((list) => {
      if (stale || !list) return
      setLoaderVersions(list)
      setLoaderVersion((list.find((l) => l.stable) ?? list[0])?.version ?? null)
    })
    return () => {
      stale = true
    }
  }, [loader, minecraft])

  useEffect(() => {
    if (!nameTouched && minecraft) setName(loader === 'vanilla' ? `Minecraft ${minecraft}` : `${LOADER_NAMES[loader]} ${minecraft}`)
  }, [minecraft, loader, nameTouched])

  const versionOptions = useMemo(
    () =>
      (versions ?? [])
        .filter((v) => snapshots || v.type === 'release')
        .map((v) => ({ value: v.id, label: v.id, hint: v.type === 'release' ? undefined : v.type.replace('old_', '') })),
    [versions, snapshots],
  )

  const create = async () => {
    if (!minecraft) return
    setBusy(true)
    const inst = await act(() => invoke('instances:create', { name, minecraft, loader, loaderVersion: loader === 'vanilla' ? null : loaderVersion }))
    setBusy(false)
    if (!inst) return
    void act(() => invoke('instances:install', inst.id))
    onClose()
    navigate({ page: 'instance', id: inst.id })
  }

  const noLoaderBuilds = loader !== 'vanilla' && loaderVersions?.length === 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New instance"
      description="Each instance keeps its own worlds, mods and settings."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!minecraft || !name.trim() || (loader !== 'vanilla' && !loaderVersion)}
            onClick={create}
          >
            Create and install
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name">
          <Input
            value={name}
            maxLength={64}
            onChange={(e) => {
              setName(e.target.value)
              setNameTouched(true)
            }}
          />
        </Field>

        <Field label="Minecraft version">
          <div className="flex items-center gap-3">
            <Select
              className="flex-1"
              label="Minecraft version"
              searchable
              loading={!versions}
              value={minecraft}
              options={versionOptions}
              onChange={setMinecraft}
            />
            <label className="flex items-center gap-2 text-xs text-text-2">
              <Switch checked={snapshots} onChange={setSnapshots} label="Show snapshots and old versions" />
              Snapshots
            </label>
          </div>
        </Field>

        <Field label="Mod loader">
          <Segmented value={loader} onChange={setLoader} options={LOADERS.map((l) => ({ value: l, label: LOADER_NAMES[l] }))} />
        </Field>

        {loader !== 'vanilla' && (
          <Field label={`${LOADER_NAMES[loader]} version`} hint={noLoaderBuilds ? undefined : 'Newest stable is preselected'}>
            {noLoaderBuilds ? (
              <p className="rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] text-text-3">
                {LOADER_NAMES[loader]} has no builds for Minecraft {minecraft}.
              </p>
            ) : (
              <Select
                label={`${LOADER_NAMES[loader]} version`}
                searchable
                loading={!loaderVersions}
                value={loaderVersion}
                onChange={setLoaderVersion}
                options={(loaderVersions ?? []).map((l) => ({ value: l.version, label: l.version, hint: l.stable ? undefined : 'beta' }))}
              />
            )}
          </Field>
        )}
      </div>
    </Dialog>
  )
}
