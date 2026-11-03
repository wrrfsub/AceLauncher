import { ChevronRight } from 'lucide-react'
import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/format'
import { AccountMenu, TaskButton } from './Sidebar'

const Slot = createContext<HTMLElement | null>(null)
export const ToolbarSlotProvider = Slot.Provider

/** Pages put their actions in the window toolbar through this portal. */
export function ToolbarActions({ children }: { children: ReactNode }) {
  const el = useContext(Slot)
  return el ? createPortal(children, el) : null
}

export interface Crumb {
  label: string
  onClick?: () => void
}

/** The draggable strip at the top: where you are, the page's actions, downloads and the account. */
export function Toolbar({ crumbs, slotRef, reserveControls }: { crumbs: Crumb[]; slotRef(el: HTMLDivElement | null): void; reserveControls: boolean }) {
  return (
    <header className={cn('drag relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-bg/80 pl-5 backdrop-blur', reserveControls ? 'pr-[148px]' : 'pr-4')}>
      <nav className="flex min-w-0 items-center gap-1.5" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-text-3" />}
            {c.onClick ? (
              <button onClick={c.onClick} className="no-drag truncate font-display text-[15px] text-text-3 hover:text-text-2">
                {c.label}
              </button>
            ) : (
              <span className="truncate font-display text-[15px]">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div ref={slotRef} className="no-drag ml-auto flex items-center gap-2" />
      <div className="flex items-center gap-1 border-l border-line pl-3">
        <TaskButton />
        <AccountMenu />
      </div>
    </header>
  )
}
