import { useState } from 'react'
import Seal from '../Seal'
import { Button, Card, Field, Note, SectionTitle } from '../ui'
import { api } from '../../lib/api'
import { useUI } from '../../lib/ui'
import { useMemory } from '../Layout'
import { forgetLeague, myTeam } from '../../lib/memory'

const isLeagueId = (s) => /^\d{12,}$/.test(s.trim())

/** The Almanac's front door: remembered leagues first, then a way to find another. */
export default function Entry({ onOpen }) {
  const { t } = useUI()
  const { leagues } = useMemory()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const lookup = async (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q || busy) return
    if (isLeagueId(q)) return onOpen(q)
    setBusy(true)
    setError('')
    try {
      setFound(await api(`/api/league/user/${encodeURIComponent(q)}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mb-6 flex items-start gap-4">
        <Seal char="盟" size={44} />
        <div className="min-w-0">
          <p className="han text-[11px] tracking-[0.25em] text-neon">联盟年鉴</p>
          <h1 className="text-3xl leading-tight">{t('The Almanac', '年鉴')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-2">
            {t(
              'Your week, read first: lineup, waivers and the next date that matters. Then the league, then the records.',
              '先读你的这一周：阵容、自由球员与下一个关键日期；再看联盟，再查记录。',
            )}
          </p>
        </div>
      </div>

      {leagues.length > 0 && (
        <>
          <SectionTitle char="册">{t('Remembered on this device', '本设备已记住')}</SectionTitle>
          <ul className="mb-6 grid gap-2 sm:grid-cols-2">
            {leagues.map((l) => {
              const mine = myTeam(l.id)
              return (
                <li key={l.id} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-1 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="nums text-xs text-fg-2">
                      {l.season} · {l.totalRosters} {t('teams', '队')}{mine ? ` · ${mine.teamName}` : ''}
                    </p>
                  </div>
                  <Button variant="quiet" className="min-h-9 px-3" onClick={() => onOpen(l.id)}>{t('Open', '打开')}</Button>
                  <button type="button" onClick={() => forgetLeague(l.id)} className="min-h-9 px-1 text-xs text-fg-3 hover:text-fg" aria-label={t('Forget league', '忘记联盟')}>✕</button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <form onSubmit={lookup} className="mb-5">
        <SectionTitle char="求">{t(leagues.length ? 'Find another league' : 'Find your league', leagues.length ? '查找其他联盟' : '查找你的联盟')}</SectionTitle>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Field
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Sleeper username or league ID', 'Sleeper 用户名或联盟 ID')}
            aria-label={t('Sleeper username or league ID', 'Sleeper 用户名或联盟 ID')}
            autoComplete="off"
          />
          <Button type="submit" disabled={busy || !query.trim()} className="sm:min-w-36">
            {busy ? t('Searching…', '查找中……') : <><span className="han">卜</span> {t('Find', '查找')}</>}
          </Button>
        </div>
      </form>

      {error && <div className="mb-5"><Note level="high">⚠️ {error}</Note></div>}

      {found && (
        <Card title={t(`${found.user.displayName}'s ${found.season} leagues`, `${found.user.displayName} 的 ${found.season} 赛季联盟`)} char="册">
          {found.leagues.length === 0 ? (
            <p className="text-sm text-fg-2">{t('No leagues found for that season.', '该赛季没有找到联盟。')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {found.leagues.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="nums text-xs text-fg-2">{l.totalRosters} {t('teams', '队')} · {l.scoringFormat.replace('_', ' ')} · {l.status}</p>
                  </div>
                  <Button variant="quiet" className="min-h-9 px-3" onClick={() => onOpen(l.id)}>{t('Open', '打开')}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  )
}
