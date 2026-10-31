import { Button, Card, DataTable, Delta, OddsBar } from '../ui'
import { fmt } from '../../lib/api'
import { useUI } from '../../lib/ui'

/** Four readings of the season as marks, each with its table behind a toggle. */
export default function SeasonLedger({ summary, season, loading, onBack, onTeam }) {
  const { t } = useUI()
  const L = summary.league
  if (!season) return <p className="font-display text-xl text-fg-3">{loading ? t('Crunching the season…', '正在推演赛季……') : '…'}</p>

  const odds = season.playoffOdds || []
  const luck = season.allPlay || []
  const eff = season.lineupEfficiency || []
  const sos = season.strengthOfSchedule || []
  const maxWins = Math.max(1, ...luck.map((a) => Math.max(a.actualWins, a.expectedWins)), ...odds.map((o) => o.projectedWins || 0))
  const sosMax = Math.max(1, ...sos.flatMap((s) => [s.avgOpponentProjection, s.avgOwnProjection]))
  const sosMin = Math.min(...sos.flatMap((s) => [s.avgOpponentProjection, s.avgOwnProjection]), sosMax - 1)

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="han text-[11px] tracking-[0.25em] text-neon">赛季记录</p>
          <h1 className="text-3xl leading-tight">{t('Season ledger', '赛季记录')}</h1>
          <p className="nums mt-1 text-sm text-fg-2">{L.name} · {L.season} · {t('through week', '截至第')} {L.lastScoredWeek}{t('', ' 周')}</p>
        </div>
        <Button variant="quiet" className="min-h-9 px-3" onClick={onBack}>← {t('League', '联盟')}</Button>
      </div>

      {odds.length > 0 && (
        <Card title={t('Playoff odds', '季后赛概率')} char="卜" subtitle={t('Monte Carlo over the remaining schedule', '对剩余赛程的蒙特卡洛模拟')}>
          <ul className="space-y-1.5">
            {odds.map((o) => (
              <li key={o.rosterId} className="grid grid-cols-[1fr_150px_84px] items-center gap-3 text-sm">
                <button type="button" onClick={() => onTeam(o.rosterId)} className="truncate text-left hover:text-neon">{o.teamName}</button>
                <OddsBar pct={o.playoffPct} />
                <span className="nums whitespace-nowrap text-right text-xs text-fg-2">{fmt(o.projectedWins)} {t('W proj.', '预计胜')}</span>
              </li>
            ))}
          </ul>
          <Table head={[t('Team', '队伍'), t('Playoff %', '晋级率'), t('Proj. wins', '预计胜场'), t('Current W', '当前胜场'), t('Games left', '剩余场次')]} rows={odds.map((o) => [o.teamName, `${fmt(o.playoffPct)}%`, fmt(o.projectedWins), o.currentWins, o.gamesLeft])} />
        </Card>
      )}

      <Card title={t('Luck', '运气')} char="运" subtitle={t('Expected wins from all-play (hollow) against actual wins (filled). Jade when ahead of expectation.', '全联对战期望胜场（空心）与实际胜场（实心）。领先期望为翠绿。')}>
        <ul className="space-y-1.5">
          {luck.map((a) => {
            const x = (v) => `${(v / maxWins) * 100}%`
            const ahead = a.actualWins > a.expectedWins
            const even = Math.abs(a.actualWins - a.expectedWins) < 0.5
            const fill = even ? 'bg-fg-2' : ahead ? 'bg-jade' : 'bg-violet'
            return (
              <li key={a.rosterId} className="grid grid-cols-[1fr_1fr_90px] items-center gap-3 text-sm">
                <button type="button" onClick={() => onTeam(a.rosterId)} className="truncate text-left hover:text-neon">{a.teamName}</button>
                <span className="relative block h-5">
                  <span className="absolute left-0 right-0 top-1/2 h-px bg-line-2" />
                  <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-line-2" style={{ left: x(Math.min(a.actualWins, a.expectedWins)), width: `calc(${x(Math.abs(a.actualWins - a.expectedWins))})` }} />
                  <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fg-2 bg-surface-1" style={{ left: x(a.expectedWins) }} title={`expected ${fmt(a.expectedWins)}`} />
                  <span className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${fill}`} style={{ left: x(a.actualWins) }} title={`actual ${a.actualWins}`} />
                </span>
                <span className="nums text-right text-xs text-fg-2">{a.actualWins} vs {fmt(a.expectedWins)}</span>
              </li>
            )
          })}
        </ul>
        <Table head={[t('Team', '队伍'), t('All-play', '全联对战'), t('Expected W', '期望胜'), t('Actual W', '实际胜'), t('Luck', '运气'), t('Avg pts', '场均'), 'σ']} rows={luck.map((a) => [a.teamName, `${a.allPlayWins}-${a.allPlayLosses}`, fmt(a.expectedWins), a.actualWins, <Delta key="l" v={a.luck} digits={1} />, fmt(a.avgPoints), fmt(a.sdPoints)])} />
      </Card>

      <Card title={t('Lineup efficiency', '阵容效率')} char="效" subtitle={t('Actual starters against the best possible lineup, every scored week', '每周实际先发与最优先发之比')}>
        <ul className="space-y-1.5">
          {eff.map((e) => (
            <li key={e.rosterId} className="grid grid-cols-[1fr_150px_120px] items-center gap-3 text-sm">
              <button type="button" onClick={() => onTeam(e.rosterId)} className="truncate text-left hover:text-neon">{e.teamName}</button>
              <span className="flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-fg-2" style={{ width: `${Math.max(2, Math.min(100, e.efficiencyPct))}%` }} /></span>
                <span className="nums w-11 text-right text-xs">{fmt(e.efficiencyPct)}%</span>
              </span>
              <span className="nums truncate text-right text-xs text-fg-2">{e.worstWeek ? t(`wk ${e.worstWeek.week}: −${fmt(e.worstWeek.left)}`, `第${e.worstWeek.week}周 −${fmt(e.worstWeek.left)}`) : '—'}</span>
            </li>
          ))}
        </ul>
        <Table head={[t('Team', '队伍'), t('Actual', '实际'), t('Optimal', '最优'), t('Left on bench', '板凳浪费'), t('Efficiency', '效率'), t('Worst week', '最差周')]} rows={eff.map((e) => [e.teamName, fmt(e.actual), fmt(e.optimal), fmt(e.pointsLeftOnBench), `${fmt(e.efficiencyPct)}%`, e.worstWeek ? `wk ${e.worstWeek.week} (−${fmt(e.worstWeek.left)})` : '—'])} />
      </Card>

      {sos.length > 0 && (
        <Card title={t('Remaining schedule', '剩余赛程')} char="程" subtitle={t('Own projected points (filled) against the average opponent (hollow), per remaining game', '自身预计（实心）与平均对手预计（空心）')}>
          <ul className="space-y-1.5">
            {sos.map((s) => {
              const span = Math.max(1, sosMax - sosMin)
              const x = (v) => `${((v - sosMin) / span) * 100}%`
              return (
                <li key={s.rosterId} className="grid grid-cols-[1fr_1fr_90px] items-center gap-3 text-sm">
                  <button type="button" onClick={() => onTeam(s.rosterId)} className="truncate text-left hover:text-neon">{s.teamName}</button>
                  <span className="relative block h-5">
                    <span className="absolute left-0 right-0 top-1/2 h-px bg-line-2" />
                    <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fg-2 bg-surface-1" style={{ left: x(s.avgOpponentProjection) }} title={`opponents ${fmt(s.avgOpponentProjection)}`} />
                    <span className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${s.avgOwnProjection >= s.avgOpponentProjection ? 'bg-jade' : 'bg-violet'}`} style={{ left: x(s.avgOwnProjection) }} title={`own ${fmt(s.avgOwnProjection)}`} />
                  </span>
                  <span className="nums text-right text-xs text-fg-2">{fmt(s.avgOwnProjection, 0)} vs {fmt(s.avgOpponentProjection, 0)}</span>
                </li>
              )
            })}
          </ul>
          <Table head={[t('Team', '队伍'), t('Games left', '剩余场次'), t('Avg opponent', '对手场均'), t('Own avg', '自身场均')]} rows={sos.map((s) => [s.teamName, s.gamesLeft, fmt(s.avgOpponentProjection), fmt(s.avgOwnProjection)])} />
        </Card>
      )}
    </>
  )
}

function Table({ head, rows }) {
  const { t } = useUI()
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-neon">{t('Table', '表格')}</summary>
      <div className="mt-2"><DataTable head={head} rows={rows} dense /></div>
    </details>
  )
}
