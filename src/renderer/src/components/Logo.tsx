/** The Ace mark: a card-corner "A" cut from a rounded tile. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M9.5 23 16 8.5 22.5 23" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.2 18h7.6" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
