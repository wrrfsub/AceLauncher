import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Toolbar, ToolbarSlotProvider, type Crumb } from './components/Toolbar'
import { ToastProvider } from './components/ui/Toast'
import { cn } from './lib/format'
import { Console } from './pages/Console'
import { Discover } from './pages/Discover'
import { Home } from './pages/Home'
import { InstanceDetail } from './pages/InstanceDetail'
import { Instances } from './pages/Instances'
import { Settings } from './pages/Settings'
import { AppProvider, useApp, type Route } from './state'

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case 'home':
      return <Home />
    case 'instances':
      return <Instances />
    case 'instance':
      return <InstanceDetail id={route.id} tab={route.tab} />
    case 'discover':
      return <Discover instanceId={route.instanceId} type={route.type} />
    case 'console':
      return <Console instanceId={route.instanceId} />
    case 'settings':
      return <Settings />
  }
}

const TITLES: Record<Route['page'], string> = {
  home: 'Home',
  instances: 'Instances',
  instance: 'Instances',
  discover: 'Discover',
  console: 'Console',
  settings: 'Settings',
}

function Shell() {
  const { route, settings, info, instances, navigate } = useApp()
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  const key = route.page === 'instance' ? `instance:${route.id}` : route.page
  const crumbs: Crumb[] =
    route.page === 'instance'
      ? [{ label: 'Instances', onClick: () => navigate({ page: 'instances' }) }, { label: instances.find((i) => i.id === route.id)?.name ?? 'Instance' }]
      : [{ label: TITLES[route.page] }]

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? 'always' : 'user'}>
      <ToolbarSlotProvider value={slot}>
        <div className="flex h-full">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col">
            <Toolbar crumbs={crumbs} slotRef={setSlot} reserveControls={info.platform !== 'darwin'} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.06 } }}
                transition={{ duration: 0.12 }}
                className={cn('min-h-0 flex-1', route.page === 'console' ? 'overflow-hidden' : 'overflow-y-auto')}
              >
                <Page route={route} />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </ToolbarSlotProvider>
    </MotionConfig>
  )
}

export function App() {
  return (
    <ToastProvider>
      <AppProvider>{(ready) => (ready ? <Shell /> : <div className="drag h-full" />)}</AppProvider>
    </ToastProvider>
  )
}
