/**
 * A carved name chop. The one place cinnabar appears at full strength, so it
 * reads as the oracle's signature rather than as decoration.
 */
export default function Seal({ char = '卜', size = 36, className = '', title }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-cinnabar-600 text-paper-50 han seal-press rounded-seal select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.56), lineHeight: 1 }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      {char}
    </span>
  )
}
