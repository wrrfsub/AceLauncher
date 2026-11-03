import { LoaderCircle } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ComponentType } from 'react'
import { cn } from '../../lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95 font-semibold',
  secondary: 'bg-surface-2 text-text border border-line hover:bg-surface-3 hover:border-line-strong',
  ghost: 'text-text-2 hover:text-text hover:bg-surface-2',
  danger: 'bg-danger/12 text-danger hover:bg-danger/20 border border-danger/20',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-lg',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ComponentType<{ className?: string }>
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, className, children, disabled, ...rest },
  ref,
) {
  const iconSize = size === 'lg' ? 'size-[18px]' : size === 'sm' ? 'size-3.5' : 'size-4'
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'no-drag inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,border-color,filter,color] duration-150 select-none disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className={cn(iconSize, 'animate-spin')} /> : Icon && <Icon className={iconSize} />}
      {children}
    </button>
  )
})

export function IconButton({
  icon: Icon,
  label,
  className,
  size = 'md',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: ComponentType<{ className?: string }>; label: string; size?: 'sm' | 'md' }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'no-drag inline-grid shrink-0 place-items-center rounded-lg text-text-2 transition-colors hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'size-7' : 'size-9',
        className,
      )}
      {...rest}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />
    </button>
  )
}
