/**
 * A name chop, drawn as a neon outline: vermilion stroke, vermilion glyph,
 * transparent fill. `glow` lights it up — the budget is one glowing element
 * per screen, so only verdict seals and the lead glance card use it.
 * `solid` is the inverse (vermilion fill, black glyph) for use on buttons.
 */
export default function Seal({ char = '卜', size = 32, glow = false, solid = false, className = '', title }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.54), lineHeight: 1 }
  const skin = solid
    ? 'bg-neon text-ground'
    : 'border-[1.5px] border-neon text-neon bg-transparent'
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-[4px] han ${skin} ${glow ? 'glow-sm' : ''} ${className}`}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      {char}
    </span>
  )
}
