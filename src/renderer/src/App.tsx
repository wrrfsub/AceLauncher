import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { Sidebar } from './components/Sidebar'
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

function Shell() {
  const { route, settings, info } = useApp()
  const key = route.page === 'instance' ? `instance:${route.id}` : route.page
  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? 'always' : 'user'}>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Title strip: drags the window; leaves room for the native window controls. */}
          <div className={cn('drag h-10 shrink-0', info.platform !== 'darwin' && 'mr-[140px]')} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={cn('min-h-0 flex-1', route.page === 'console' ? 'overflow-hidden' : 'overflow-y-auto')}
            >
              <Page route={route} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </MotionConfig>
  )
}

export function App() {
  return (
    <ToastProvider>
      <AppProvider>{(ready) => (ready ? <Shell /> : <Splash />)}</AppProvider>
    </ToastProvider>
  )
}

function Splash() {
  return <div className="drag h-full" />
}
