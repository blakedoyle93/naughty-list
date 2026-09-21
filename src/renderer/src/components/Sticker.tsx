import type { CSSProperties, ReactNode } from 'react'

type Color = 'yellow' | 'red' | 'green' | 'blue' | 'purple' | 'paper'

const COLORS: Record<Color, string> = {
  yellow: 'var(--color-crayon-yellow)',
  red: 'var(--color-crayon-red)',
  green: 'var(--color-crayon-green)',
  blue: 'var(--color-crayon-blue)',
  purple: 'var(--color-crayon-purple)',
  paper: 'var(--color-paper-deep)'
}

export function Sticker({
  children,
  color = 'yellow',
  tilt = -4,
  slap = false,
  className = ''
}: {
  children: ReactNode
  color?: Color
  tilt?: number
  slap?: boolean
  className?: string
}): React.JSX.Element {
  const style = { '--sticker-color': COLORS[color], '--tilt': `${tilt}deg` } as CSSProperties
  const textColor = color === 'red' || color === 'blue' || color === 'purple' ? '#fff' : undefined
  return (
    <span
      className={`sticker ${slap ? 'slap' : ''} ${className}`}
      style={{ ...style, color: textColor }}
    >
      {children}
    </span>
  )
}
