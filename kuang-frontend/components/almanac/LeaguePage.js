import { Button, Card, Delta, GlanceCard, OddsBar, SectionTitle } from '../ui'
import Seal from '../Seal'
import { fmt } from '../../lib/api'
import { useUI } from '../../lib/ui'
import { myTeam, setMyTeam } from '../../lib/memory'

const DEFAULT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/** League-level view: pulse, compact standings with odds, strength grid. */
export default function LeaguePage({ summary, onTeam, onSeason, onEntry }) {
  const { t } = useUI()
  const L = summary.league
  const POS = L.activePositions?.length ? L.activePositions : DEFAULT_POSITIONS
  const mine = myTeam(L.id)
  const standings = summary.standings
  const strength = summary.positionalStrength

  const best = [...standings].sort((a, b) => (b.playoffPct ?? 0) - (a.playoffPct ?? 0))[0]
  const luckiest = [...standings].sort((a, b) => (b.luck ?? 0) - (a.luck ?? 0))[0]
  const unluckiest = [...standings].sort((a, b) => (a.luck ?? 0) - (b.luck ?? 0))[0]
  const strongest = [...strength.teams][0]
  const maxAbs = Math.max(1, ...strength.teams.flatMap((x) => POS.map((p) => Math.abs(x.strength[p]?.vsAverage ?? 0))))

  const claim = (row) => {
    setMyTeam(L.id, { rosterId: row.rosterId, teamName: row.teamName })
    onTeam(row.rosterId)
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <Seal char="盟" size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl leading-tight">{L.name}</h1>
          <p className="nums mt-1 text-sm text-fg-2">
            {L.season} · {t('week', '第')} {L.currentWeek}{t('', ' 周')} · {L.totalRosters} {t('teams', '队')} · {L.scoringDescription}
          </p>
          <p className="mt-1 text-xs text-fg-3">
            {t(`Playoffs: ${L.playoffTeams} teams from week ${L.playoffWeekStart}`, `季后赛：第 ${L.playoffWeekStart} 周起，${L.playoffTeams} 队`)}
            {L.scoringAudit && <> · {t(`${L.scoringAudit.totalRules} scoring rules applied`, `已应用 ${L.scoringAudit.totalRules} 条计分规则`)}{L.scoringAudit.unscoredCount > 0 && t(`, ${L.scoringAudit.unscoredCount} unforecastable`, `，${L.scoringAudit.unscoredCount} 条无法预测`)}</>}
          </p>
          {L.format?.description && <p className="mt-1 text-xs text-fg-2"><span className="han text-neon">制</span> {L.format.description}</p>}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button variant="quiet" className="min-h-9 px-3" onClick={onEntry}>← {t('Leagues', '联盟列表')}</Button>
          <Button variant="quiet" className="min-h-9 px-3" onClick={onSeason}><span className="han text-neon">籍</span> {t('Season ledger', '赛季记录')}</Button>
        </div>
      </div>

      {mine && (
        <div className="mb-4">
          <GlanceCard
            lead
            n={standings.find((s) => s.rosterId === mine.rosterId)?.playoffPct != null ? `${fmt(standings.find((s) => s.rosterId === mine.rosterId).playoffPct, 0)}%` : '→'}
            tone="good"
            title={t(`Open your day page · ${mine.teamName}`, `打开你的每日页 · ${mine.teamName}`)}
            sub={t('Lineup, waivers and the next date that matters.', '阵容、自由球员与下一个关键日期。')}
            onClick={() => onTeam(mine.rosterId)}
          />
        </div>
      )}

      <SectionTitle char="脉">{t('League pulse', '联盟脉搏')}</SectionTitle>
      <div className="mb-6 grid gap-2 sm:grid-cols-3">
        <GlanceCard n={best?.playoffPct != null ? `${fmt(best.playoffPct, 0)}%` : '—'} title={t(`${best?.teamName} leads the odds`, `${best?.teamName} 晋级概率最高`)} sub={t(`${best?.wins}-${best?.losses} · ${fmt(best?.pointsFor, 0)} points for`, `${best?.wins}胜${best?.losses}负 · 得分 ${fmt(best?.pointsFor, 0)}`)} onClick={() => onTeam(best.rosterId)} char="阅" />
        <GlanceCard n={<Delta v={luckiest?.luck} digits={1} />} title={t(`${luckiest?.teamName} is the luckiest`, `${luckiest?.teamName} 最幸运`)} sub={t(`${unluckiest?.teamName} the unluckiest at ${fmt(unluckiest?.luck, 1)}`, `${unluckiest?.teamName} 最不幸（${fmt(unluckiest?.luck, 1)}）`)} onClick={() => onTeam(luckiest.rosterId)} char="阅" />
        <GlanceCard n={fmt(strongest?.totalStarterValue, 0)} title={t(`${strongest?.teamName} has the strongest starters`, `${strongest?.teamName} 先发最强`)} sub={t('rest-of-season value above replacement', '剩余赛季高于替补的价值')} onClick={() => onTeam(strongest.rosterId)} char="阅" />
      </div>

      <Card title={t('Standings', '名次')} char="名" subtitle={t('Tap a team to read its day page. Mark yours to make it the front door.', '点击队伍查看每日页；标记你的队伍后将成为默认入口。')}>
        <ul className="divide-y divide-line">
          {standings.map((s) => {
            const isMine = mine?.rosterId === s.rosterId
            return (
              <li key={s.rosterId} className={`grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[28px_1fr_70px_70px_140px_60px_auto] ${isMine ? '-mx-2 rounded-[8px] bg-neon-soft px-2' : ''}`}>
                <span className="nums text-sm text-fg-2">{s.rank}</span>
                <button type="button" onClick={() => onTeam(s.rosterId)} className="min-w-0 text-left">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{s.teamName}</span>
                    {isMine && <span className="han text-xs text-neon">我</span>}
                  </span>
                  <span className="block truncate text-xs text-fg-3">{s.ownerName}{s.allPlay ? ` · ${t('all-play', '全联对战')} ${s.allPlay}` : ''}</span>
                </button>
                <span className="nums text-sm sm:order-none">{s.wins}-{s.losses}{s.ties ? `-${s.ties}` : ''}</span>
                <span className="nums hidden text-sm text-fg-2 sm:block">{fmt(s.pointsFor, 0)}</span>
                <span className="col-span-2 sm:col-span-1"><OddsBar pct={s.playoffPct} /></span>
                <span className="hidden sm:block"><Delta v={s.luck} digits={1} /></span>
                <span className="col-start-3 row-start-1 flex items-center justify-end gap-1 sm:col-start-auto sm:row-start-auto">
                  {!isMine && (
                    <button type="button" onClick={() => claim(s)} className="min-h-8 rounded-[6px] px-2 text-[11px] text-fg-3 hover:text-fg" title={t('This is my team', '这是我的队伍')}>
                      {t('mine', '我的')}
                    </button>
                  )}
                  <Button variant="quiet" className="min-h-8 px-2.5 text-xs" onClick={() => onTeam(s.rosterId)}>→</Button>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-xs text-fg-3">
          {t('Odds from a Monte Carlo over the remaining schedule. Luck = actual wins minus all-play expected wins. Points against and starter value are in the season ledger.', '概率来自对剩余赛程的蒙特卡洛模拟；运气 = 实际胜场减去全联对战期望胜场。失分与先发价值见赛季记录。')}
        </p>
      </Card>

      <Card title={t('Positional strength', '位置强弱')} char="势" subtitle={t('Starter value against the league average. Jade above, violet below.', '先发价值与联盟平均之差：翠绿为高，紫为低。')}>
        <div className="overflow-x-auto">
          <div className="grid min-w-[420px] items-center gap-[3px] text-[11px]" style={{ gridTemplateColumns: `minmax(120px,1.4fr) repeat(${POS.length}, minmax(44px,1fr))` }}>
            <span />
            {POS.map((p) => <span key={p} className="nums text-center text-fg-2">{p}</span>)}
            {strength.teams.map((x) => (
              <HeatRow key={x.rosterId} row={x} positions={POS} maxAbs={maxAbs} mine={mine?.rosterId === x.rosterId} onClick={() => onTeam(x.rosterId)} />
            ))}
          </div>
        </div>
        {!L.usesKicker && !L.usesDefense && (
          <p className="mt-3 text-xs text-fg-3">{t('This league starts no kicker or defence, so neither is scored or recommended anywhere.', '本联盟不设 K 与 DEF 先发位，因此各处均不计算、不推荐。')}</p>
        )}
      </Card>
    </>
  )
}

function HeatRow({ row, positions, maxAbs, mine, onClick }) {
  return (
    <>
      <button type="button" onClick={onClick} className={`truncate pr-2 text-left ${mine ? 'text-neon' : ''}`}>{row.teamName}</button>
      {positions.map((p) => {
        const v = row.strength[p]?.vsAverage ?? 0
        const a = Math.min(0.85, 0.12 + (Math.abs(v) / maxAbs) * 0.7)
        const bg = v >= 0 ? `rgba(53,224,160,${a.toFixed(2)})` : `rgba(160,140,255,${a.toFixed(2)})`
        return (
          <span key={p} className={`nums flex h-8 items-center justify-center rounded-[3px] text-[10.5px] ${a >= 0.45 ? 'text-ground' : 'text-fg'}`} style={{ background: bg }} title={`${row.teamName} ${p}: ${v > 0 ? '+' : ''}${fmt(v, 0)} vs league average`}>
            {v > 0 ? '+' : ''}{fmt(v, 0)}
          </span>
        )
      })}
    </>
  )
}
