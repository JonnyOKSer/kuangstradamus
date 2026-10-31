import { Pill, Sheet, Slot } from '../ui'
import { fmt } from '../../lib/api'
import { useUI } from '../../lib/ui'
import { href } from '../../lib/url'

/**
 * Everything a manager asks about one player, assembled from the team report:
 * is he playing, what is he worth here, what is coming, why is this week's
 * number what it is. A dedicated endpoint can replace the assembly later.
 */
export default function PlayerSheet({ playerId, team, leagueId, onClose }) {
  const { t } = useUI()
  const open = !!playerId
  const p = open ? find(playerId, team) : null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={p ? (
        <span className="flex items-center gap-2">
          <span className="font-display text-xl">{p.name}</span>
          <span className="nums text-xs text-fg-2">{[p.position, p.team].filter(Boolean).join(' · ')}</span>
        </span>
      ) : t('Player', '球员')}
    >
      {!p ? (
        <p className="text-sm text-fg-2">{t('Not on this roster or waiver list.', '不在本阵容或自由球员名单中。')}</p>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${!p.injuryStatus ? 'bg-jade' : p.injuryStatus === 'Questionable' ? 'bg-amber' : 'bg-neon'}`} aria-hidden="true" />
            <span>{p.injuryStatus || t('Healthy', '健康')}</span>
            {p.byeWeeks?.length > 0 && <span className="nums text-fg-2">· {t('bye', '轮空')} wk {p.byeWeeks.join(', ')}</span>}
            {p.isStarter && <Pill tone="jade">{t('starter', '先发')}</Pill>}
            {p.onIR && <Pill tone="neon">IR</Pill>}
            {p.source === 'waiver' && <Pill>{t('free agent', '自由球员')}</Pill>}
            {p.source === 'sleeper' && <Pill tone="violet">{t('sleeper', '潜力')}</Pill>}
          </p>

          {(p.ros != null || p.rosPoints != null) && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Tile label={t('rest of season', '剩余赛季')} v={fmt(p.ros ?? p.rosPoints, 0)} />
              <Tile label={t(`free ${p.position}`, `替补 ${p.position}`)} v={p.replacement != null ? fmt(p.replacement, 0) : '—'} />
              <Tile label={t('value', '价值')} v={p.rawVorp != null ? `${p.rawVorp > 0 ? '+' : ''}${fmt(p.rawVorp, 0)}` : fmt(p.vorp, 0)} tone={(p.rawVorp ?? p.vorp ?? 0) >= 0 ? 'jade' : 'violet'} />
            </div>
          )}
          {p.rawVorp != null && (
            <p className="mt-2 text-sm text-fg-2">
              {p.rawVorp >= 0
                ? t(`Worth ${fmt(p.rawVorp, 0)} points more than a free ${p.position} in this league over the rest of the season.`, `剩余赛季比本联盟可免费获得的 ${p.position} 多 ${fmt(p.rawVorp, 0)} 分。`)
                : t(`Worth ${fmt(Math.abs(p.rawVorp), 0)} points less than a free ${p.position} in this league over the rest of the season.`, `剩余赛季比本联盟可免费获得的 ${p.position} 少 ${fmt(Math.abs(p.rawVorp), 0)} 分。`)}
            </p>
          )}

          {(p.nextWeek != null || p.nextWeekPoints != null) && (
            <p className="nums mt-2 text-sm"><span className="text-fg-2">{t('this week', '本周')}</span> {fmt(p.nextWeek ?? p.nextWeekPoints)}{p.weeksLeft ? <span className="text-fg-3"> · {p.weeksLeft} {t('weeks left', '周剩余')}</span> : null}</p>
          )}

          {p.flags?.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber">{p.flags.map((f) => <li key={f.text}>⚠ {f.text}</li>)}</ul>
          )}

          {p.gates && (
            <div className="mt-4">
              <p className="mb-1 text-xs text-fg-2">
                {t("This week's gates", '本周关卡')} · <span className="nums">{fmt(p.baseProjection)} → <b className="text-fg">{fmt(p.points)}</b></span>
                {p.slot && <> · <Slot>{p.slot}</Slot></>}
              </p>
              <ul className="divide-y divide-line text-xs">
                {p.gates.map((g) => (
                  <li key={g.name} className={`grid grid-cols-[76px_52px_1fr] gap-2 py-1 ${!g.applied ? 'text-fg-3' : g.verdict === 'fail' ? 'text-violet' : g.verdict === 'pass' ? 'text-jade' : 'text-fg-2'}`}>
                    <span>{g.name}</span>
                    <span className="nums">{g.applied ? `×${fmt(g.effect, 2)}` : t('context', '参考')}</span>
                    <span>{g.note}</span>
                  </li>
                ))}
              </ul>
              {p.weather?.summary && <p className="mt-1 text-xs text-fg-3">🌦 {p.weather.summary}</p>}
            </div>
          )}

          {p.why && <p className="mt-3 text-sm text-fg-2">{p.why}</p>}
          {p.contingentPointsPerGame != null && <p className="nums mt-1 text-xs text-fg-2">{t('would inherit', '可继承')} ~{fmt(p.contingentPointsPerGame)} {t('pts/gm', '分/场')}{p.sampleGames ? ` · ${p.sampleGames}-${t('game sample', '场样本')}` : ''}</p>}
          {p.faab?.low != null && <p className="nums mt-1 text-xs text-fg-2">FAAB ${p.faab.low}{p.faab.high !== p.faab.low && `–$${p.faab.high}`} · {t('median', '中位')} ${p.faab.median} · {p.faab.sampleSize} {t('bids', '次出价')}</p>}
          {p.upgradeOver && <p className="mt-1 text-xs text-jade">{t('upgrade over', '优于')} {p.upgradeOver.name} (+{fmt(p.upgradeOver.gain)})</p>}
          {p.trendingAdds ? <p className="nums mt-1 text-xs text-fg-3">{p.trendingAdds.toLocaleString()} {t('adds across Sleeper this week', '本周全平台签入次数')}</p> : null}

          <a
            href={href('/', p.source === 'roster' ? { give: p.name, l: leagueId } : { get: p.name, l: leagueId })}
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-[6px] border border-line px-3 text-sm text-neon hover:border-neon"
          >
            <span className="han">易</span> {t('Ask the Oracle about a trade', '向神谕询问交易')}
          </a>
        </>
      )}
    </Sheet>
  )
}

function Tile({ label, v, tone }) {
  const cls = tone === 'jade' ? 'text-jade' : tone === 'violet' ? 'text-violet' : ''
  return (
    <div className="rounded-[8px] border border-line bg-surface-2 px-2.5 py-2">
      <div className="text-[10.5px] text-fg-2">{label}</div>
      <div className={`nums font-display text-xl leading-tight ${cls}`}>{v}</div>
    </div>
  )
}

function find(id, team) {
  if (!team) return null
  const sid = String(id)
  const lineup = team.lineup
  const gated = lineup
    ? [...(lineup.recommended || []), ...(lineup.current || [])].find((x) => String(x.id) === sid)
    : null
  const ros = team.roster?.find((x) => String(x.id) === sid)
  if (ros) return { ...ros, source: 'roster', ...(gated ? { gates: gated.gates, baseProjection: gated.baseProjection, points: gated.points, slot: gated.slot, weather: gated.weather } : {}) }
  const w = team.waivers?.targets?.find((x) => String(x.id) === sid)
  if (w) return { ...w, source: 'waiver' }
  const s = team.waivers?.sleepers?.find((x) => String(x.id) === sid)
  if (s) return { ...s, source: 'sleeper' }
  const tt = team.tradeTargets?.find((x) => String(x.target.id) === sid)
  if (tt) return { ...tt.target, source: 'trade', rawVorp: tt.target.vorp }
  const d = team.waivers?.dropCandidates?.find((x) => String(x.id) === sid)
  if (d) return { ...d, source: 'roster' }
  if (gated) return { ...gated, source: 'roster' }
  return null
}
