import { FolderOpen, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ACCENTS, type Accent, type DiscordStatus, type JavaRuntime, type UpdateState } from '@shared/types'
import { Button } from '../components/ui/Button'
import { Badge, Input, Progress, Row, Segmented, Slider, Switch } from '../components/ui/controls'
import { Select } from '../components/ui/Select'
import { ace, invoke } from '../lib/ipc'
import { cn } from '../lib/format'
import { useApp } from '../state'

const ACCENT_SWATCH: Record<Accent, string> = { diamond: '#57c7d4', emerald: '#3fc27a', amethyst: '#a98beb', gold: '#e8be4a', redstone: '#e5534b' }

export function Settings() {
  return (
    <div className="mx-auto max-w-[720px] px-6 py-5">
      <div className="flex flex-col gap-6">
        <JavaSection />
        <GameSection />
        <AppearanceSection />
        <DiscordSection />
        <UpdatesSection />
        <AdvancedSection />
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold">{title}</h2>
      <div className="divide-y divide-line rounded-[10px] border border-line bg-surface px-4">{children}</div>
    </section>
  )
}

function JavaSection() {
  const { settings, updateSettings, act } = useApp()
  const [java, setJava] = useState<JavaRuntime[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const scan = async (refresh: boolean) => {
    setScanning(true)
    const list = await act(() => invoke('java:list', refresh))
    if (list) setJava(list)
    setScanning(false)
  }
  useEffect(() => void scan(false), [])

  const options = [
    { value: 'auto', label: 'Automatic', hint: 'per version' },
    ...(java ?? []).map((j) => ({ value: j.path, label: `Java ${j.majorVersion} (${j.version})`, hint: j.managed ? 'Ace' : undefined })),
    ...(settings.javaPath && !java?.some((j) => j.path === settings.javaPath) ? [{ value: settings.javaPath, label: settings.javaPath }] : []),
    { value: 'browse', label: 'Browse…' },
  ]

  return (
    <Section title="Java">
      <Row title="Default Java" description="Automatic uses the major version each Minecraft release asks for. A fixed Java applies to every instance without its own.">
        <Select
          className="w-72"
          label="Default Java"
          value={settings.javaPath ?? 'auto'}
          options={options}
          onChange={async (v) => {
            if (v === 'browse') {
              const p = await act(() => invoke('dialog:pickJava'))
              if (p) await updateSettings({ javaPath: p })
            } else await updateSettings({ javaPath: v === 'auto' ? null : v })
          }}
        />
      </Row>
      <Row title="Download Java automatically" description="Fetches Mojang's official runtime when no matching Java is installed.">
        <Switch label="Download Java automatically" checked={settings.autoInstallJava} onChange={(v) => updateSettings({ autoInstallJava: v })} />
      </Row>
      <div className="py-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-medium">Detected runtimes</p>
          <Button size="sm" variant="ghost" icon={RefreshCw} loading={scanning} onClick={() => scan(true)}>
            Rescan
          </Button>
        </div>
        {java?.length === 0 && <p className="text-xs text-text-3">None found. Ace will download one when needed.</p>}
        <ul className="flex flex-col gap-1">
          {java?.map((j) => (
            <li key={j.path} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
              <span className="w-16 text-[13px] font-medium">Java {j.majorVersion}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-3 selectable" title={j.path}>
                {j.path}
              </span>
              {j.managed && <Badge tone="accent">Downloaded by Ace</Badge>}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

function GameSection() {
  const { settings, updateSettings, info, act } = useApp()
  const [maxMemory, setMaxMemory] = useState(settings.maxMemory)
  const [concurrency, setConcurrency] = useState(settings.maxConcurrentDownloads)
  const cap = Math.max(4096, Math.floor(info.totalMemory / 1024 / 1024 / 512) * 512)
  const totalGb = (info.totalMemory / 1024 ** 3).toFixed(0)

  return (
    <Section title="Game">
      <Row title="Memory" description={`Maximum heap for instances without their own setting. This computer has ${totalGb} GB.`}>
        <div className="flex w-80 items-center gap-3">
          <Slider label="Maximum memory" min={1024} max={cap} step={512} value={maxMemory} onChange={setMaxMemory} />
          <span className="w-14 text-right text-xs tabular-nums">{(maxMemory / 1024).toFixed(1)} GB</span>
        </div>
        {maxMemory !== settings.maxMemory && (
          <Button size="sm" onClick={() => updateSettings({ maxMemory, minMemory: Math.min(settings.minMemory, maxMemory) })}>
            Apply
          </Button>
        )}
      </Row>
      <Row title="Game directory" description={<span className="font-mono break-all selectable">{settings.dataDir}</span>}>
        <Button
          size="sm"
          icon={FolderOpen}
          onClick={async () => {
            const dir = await act(() => invoke('dialog:pickDirectory'))
            if (dir) await updateSettings({ dataDir: dir })
          }}
        >
          Change
        </Button>
      </Row>
      <p className="-mt-2 pb-3 text-[11px] text-text-3">Shared versions, libraries and Java runtimes live here. Existing instances keep their own folders.</p>
      <Row title="When the game starts">
        <Segmented
          size="sm"
          value={settings.onLaunch}
          onChange={(v) => updateSettings({ onLaunch: v })}
          options={[
            { value: 'keep', label: 'Keep open' },
            { value: 'minimize', label: 'Minimize' },
          ]}
        />
      </Row>
      <Row title="Parallel downloads" description="Lower this on slow or metered connections.">
        <div className="flex w-56 items-center gap-3">
          <Slider label="Parallel downloads" min={1} max={64} step={1} value={concurrency} onChange={setConcurrency} />
          <span className="w-6 text-right text-xs tabular-nums">{concurrency}</span>
        </div>
        {concurrency !== settings.maxConcurrentDownloads && (
          <Button size="sm" onClick={() => updateSettings({ maxConcurrentDownloads: concurrency })}>
            Apply
          </Button>
        )}
      </Row>
    </Section>
  )
}

function AppearanceSection() {
  const { settings, updateSettings } = useApp()
  return (
    <Section title="Appearance">
      <Row title="Theme">
        <Segmented
          size="sm"
          value={settings.theme}
          onChange={(v) => updateSettings({ theme: v })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />
      </Row>
      <Row title="Accent colour">
        <div className="flex gap-2" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button
              key={a}
              role="radio"
              aria-checked={settings.accent === a}
              aria-label={a}
              onClick={() => updateSettings({ accent: a })}
              className={cn('size-6 rounded-full ring-offset-2 ring-offset-surface transition-shadow', settings.accent === a && 'ring-2 ring-text')}
              style={{ background: ACCENT_SWATCH[a] }}
            />
          ))}
        </div>
      </Row>
      <Row title="Interface size" description="Auto grows the interface with the window, so it stays readable when maximized.">
        <Segmented
          size="sm"
          value={settings.uiScale}
          onChange={(v) => updateSettings({ uiScale: v })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: '90', label: '90%' },
            { value: '100', label: '100%' },
            { value: '110', label: '110%' },
            { value: '125', label: '125%' },
            { value: '150', label: '150%' },
          ]}
        />
      </Row>
      <Row title="Reduce motion" description="Turns off most animations.">
        <Switch label="Reduce motion" checked={settings.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
      </Row>
    </Section>
  )
}

function DiscordSection() {
  const { settings, updateSettings } = useApp()
  const [status, setStatus] = useState<DiscordStatus | null>(null)
  const [appId, setAppId] = useState(settings.discordClientId)
  useEffect(() => {
    invoke('discord:status').then(setStatus, () => {})
    return ace.on('discord:status', setStatus)
  }, [])

  const line: Record<DiscordStatus['state'], [string, string]> = {
    off: ['Off', 'bg-text-3'],
    unconfigured: ['Add a Discord application ID to turn this on', 'bg-warn'],
    connecting: ['Connecting to Discord…', 'bg-warn'],
    connected: [`Connected${status?.user ? ` as ${status.user}` : ''}`, 'bg-ok'],
    unavailable: [status?.error === 'Discord is not running' ? "Discord isn't running. Ace will connect when it opens." : `Not connected: ${status?.error ?? ''}`, 'bg-text-3'],
  }
  const [text, dot] = status ? line[status.state] : ['…', 'bg-text-3']

  return (
    <Section title="Discord">
      <Row
        title="Rich Presence"
        description={
          <span className="flex items-center gap-1.5">
            <span className={cn('size-1.5 rounded-full', dot)} />
            {text}
          </span>
        }
      >
        <Switch label="Show what you're playing on Discord" checked={settings.discordPresence} onChange={(v) => updateSettings({ discordPresence: v })} />
      </Row>
      <Row title="Application ID" description="Leave empty to use Ace Launcher's own. Only needed if you want a different name after “Playing”.">
        <Input
          className="w-60 font-mono"
          inputMode="numeric"
          value={appId}
          placeholder="Ace Launcher (default)"
          onChange={(e) => setAppId(e.target.value.trim())}
          onBlur={() => appId !== settings.discordClientId && updateSettings({ discordClientId: appId })}
        />
      </Row>
    </Section>
  )
}

function UpdatesSection() {
  const { settings, updateSettings, info, act } = useApp()
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    invoke('updates:state').then(setState, () => {})
    return ace.on('updates:state', setState)
  }, [])

  const describe = (s: UpdateState): string =>
    ({
      idle: 'Not checked yet',
      unconfigured: 'Updates are not configured for this build',
      checking: 'Checking…',
      available: `Version ${s.version} is available`,
      'not-available': "You're up to date",
      downloading: `Downloading ${s.version ?? ''}… ${Math.round(s.progress)}%`,
      downloaded: `Version ${s.version} is ready. Restart to install.`,
      error: `Update failed: ${s.error}`,
    })[s.status]

  return (
    <Section title="Updates">
      <Row title={`Ace Launcher ${info.version}`} description={state ? describe(state) : '…'}>
        {state?.status === 'available' && (
          <Button size="sm" variant="primary" onClick={() => act(() => invoke('updates:download'))}>
            Download
          </Button>
        )}
        {state?.status === 'downloaded' && (
          <Button size="sm" variant="primary" onClick={() => act(() => invoke('updates:install'))}>
            Restart now
          </Button>
        )}
        {state && !['unconfigured', 'downloading', 'downloaded', 'checking'].includes(state.status) && (
          <Button size="sm" icon={RefreshCw} onClick={() => act(() => invoke('updates:check')).then((s) => s && setState(s))}>
            Check
          </Button>
        )}
      </Row>
      {state?.status === 'downloading' && <Progress className="mb-4" value={state.progress} />}
      <Row title="Check automatically on startup">
        <Switch label="Check for updates on startup" checked={settings.autoCheckUpdates} onChange={(v) => updateSettings({ autoCheckUpdates: v })} />
      </Row>
      <Row title="Include pre-releases">
        <Switch label="Include pre-releases" checked={settings.allowPrerelease} onChange={(v) => updateSettings({ allowPrerelease: v })} />
      </Row>
    </Section>
  )
}

function AdvancedSection() {
  const { settings, updateSettings, info } = useApp()
  const [jvmArgs, setJvmArgs] = useState(settings.jvmArgs)
  const [clientId, setClientId] = useState(settings.msClientId)
  const [cfKey, setCfKey] = useState(settings.curseforgeApiKey)
  const secure = info.tokenStorage === 'secure'

  return (
    <Section title="Advanced">
      <Row title="Global JVM arguments" description="Added to every launch before instance arguments.">
        <Input className="w-80 font-mono" value={jvmArgs} placeholder="-XX:+UseG1GC" onChange={(e) => setJvmArgs(e.target.value)} onBlur={() => jvmArgs !== settings.jvmArgs && updateSettings({ jvmArgs })} />
      </Row>
      <Row title="Azure client ID" description={info.authConfigured && !settings.msClientId ? 'Using the ID built into this release.' : 'Needed for Microsoft sign-in. See the README.'}>
        <Input
          className="w-80 font-mono"
          value={clientId}
          placeholder="00000000-0000-0000-0000-000000000000"
          onChange={(e) => setClientId(e.target.value.trim())}
          onBlur={() => clientId !== settings.msClientId && updateSettings({ msClientId: clientId })}
        />
      </Row>
      <Row title="CurseForge API key" description="Enables CurseForge in Discover. Get one at console.curseforge.com.">
        <Input
          className="w-80 font-mono"
          type="password"
          value={cfKey}
          onChange={(e) => setCfKey(e.target.value.trim())}
          onBlur={() => cfKey !== settings.curseforgeApiKey && updateSettings({ curseforgeApiKey: cfKey })}
        />
      </Row>
      <Row
        title="Sign-in token storage"
        description={
          secure
            ? 'Encrypted with your system keychain.'
            : info.tokenStorage === 'weak'
              ? 'No system keyring found, so tokens use a weak built-in key. Install gnome-keyring or KWallet.'
              : "Encryption isn't available, so sign-in can't be saved."
        }
      >
        {secure ? <ShieldCheck className="size-5 text-ok" /> : <ShieldAlert className="size-5 text-warn" />}
      </Row>
    </Section>
  )
}
