import { useCallback, useEffect, useState } from 'react'
import {
  changePassword,
  createUser,
  debugSync,
  exportCallsCsv,
  fetchCalls,
  fetchDashboardSummary,
  fetchDashboardHourly,
  fetchDashboardTimeseries,
  fetchMe,
  fetchOvhSettings,
  fetchUsers,
  login,
  saveOvhSettings,
  testOvhSettings,
  triggerSync,
  updateUser
} from './api'

export type User = {
  id: number
  username: string
  role: 'ADMIN' | 'OPERATEUR'
  must_change_password: boolean
}

const pages = {
  dashboard: 'Dashboard',
  calls: 'Appels',
  teams: "Moyens d'équipe",
  users: 'Utilisateurs',
  settings: 'Paramètres OVH',
  debug: 'Debug synchro',
  changePassword: 'Changer mot de passe'
}

const wsUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws`
}

const AUTO_REFRESH_INTERVAL_MS = 2000

const App = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [user, setUser] = useState<User | null>(null)
  const [page, setPage] = useState<keyof typeof pages>('dashboard')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setUser(null)
      return
    }
    fetchMe(token)
      .then((me) => {
        setUser(me)
      })
      .catch(() => setToken(null))
  }, [token])

  const isAdmin = user?.role === 'ADMIN'

  if (!token) {
    return (
      <Login
        onLogin={async (username, password) => {
          setError('')
          try {
            const result = await login(username, password)
            localStorage.setItem('token', result.access_token)
            setToken(result.access_token)
            setPage('dashboard')
          } catch (err) {
            setError('Identifiants invalides')
          }
        }}
        error={error}
      />
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Secours Calls</h1>
        <nav>
          <button onClick={() => setPage('dashboard')}>Dashboard</button>
          <button onClick={() => setPage('calls')}>Appels</button>
          <button onClick={() => setPage('teams')}>Moyens d'équipe</button>
          {isAdmin && <button onClick={() => setPage('users')}>Utilisateurs</button>}
          {isAdmin && <button onClick={() => setPage('settings')}>Paramètres OVH</button>}
          {isAdmin && <button onClick={() => setPage('debug')}>Debug synchro</button>}
        </nav>
        <div className="sidebar-footer">
          <span>{user?.username}</span>
          <button
            onClick={() => {
              localStorage.removeItem('token')
              setToken(null)
            }}
          >
            Déconnexion
          </button>
        </div>
      </aside>
      <main>
        {page === 'dashboard' && <Dashboard token={token} isAdmin={isAdmin} />}
        {page === 'calls' && <Calls token={token} isAdmin={isAdmin} />}
        {page === 'teams' && <TeamLeads />}
        {page === 'users' && isAdmin && <Users token={token} />}
        {page === 'settings' && isAdmin && <OvhSettings token={token} />}
        {page === 'debug' && isAdmin && <SyncDebug token={token} />}
        {page === 'changePassword' && (
          <ChangePassword token={token} onDone={() => fetchMe(token).then(setUser)} />
        )}
      </main>
    </div>
  )
}

const Login = ({
  onLogin,
  error
}: {
  onLogin: (username: string, password: string) => void
  error: string
}) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  return (
    <div className="login">
      <h2>Connexion</h2>
      <form
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          onLogin(username, password)
        }}
      >
        <label>
          Nom d'utilisateur
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Se connecter</button>
      </form>
    </div>
  )
}

const ChangePassword = ({ token, onDone }: { token: string; onDone: () => void }) => {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  return (
    <div className="card">
      <h2>Changer le mot de passe</h2>
      <label>
        Mot de passe actuel
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </label>
      <label>
        Nouveau mot de passe
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>
      <button
        onClick={async () => {
          await changePassword(token, currentPassword, newPassword)
          setMessage('Mot de passe mis à jour')
          onDone()
        }}
      >
        Valider
      </button>
      {message && <p>{message}</p>}
    </div>
  )
}

const Dashboard = ({ token, isAdmin }: { token: string; isAdmin: boolean }) => {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [summary, setSummary] = useState<{
    today_total: number
    today_missed: number
    week_total: number
    week_missed: number
    today_inbound: number
    today_outbound: number
    week_inbound: number
    week_outbound: number
    today_avg_duration: number
    week_avg_duration: number
  } | null>(null)
  const [timeseries, setTimeseries] = useState<
    { date: string; total: number; missed: number }[]
  >([])
  const [hourly, setHourly] = useState<{ hour: number; total: number }[]>([])
  const [latestCalls, setLatestCalls] = useState<any[]>([])
  const [ovhStatus, setOvhStatus] = useState<{
    last_sync_at?: string | null
    last_error?: string | null
  } | null>(null)

  const reload = async () => {
    const results = await Promise.allSettled([
      fetchDashboardSummary(token),
      fetchDashboardTimeseries(token),
      fetchDashboardHourly(token),
      fetchCalls(token, { page: 1, page_size: 5 }),
      isAdmin ? fetchOvhSettings(token) : Promise.resolve(null)
    ])
    const [summaryResult, timeseriesResult, hourlyResult, callsResult, ovhResult] = results
    setLoadError('')
    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value)
    } else {
      setSummary(null)
      setLoadError('Impossible de charger le dashboard. Vérifiez la connexion.')
    }
    if (timeseriesResult.status === 'fulfilled') {
      setTimeseries(timeseriesResult.value)
    } else {
      setTimeseries([])
      setLoadError((prev) => prev || 'Impossible de charger les statistiques.')
    }
    if (hourlyResult.status === 'fulfilled') {
      setHourly(hourlyResult.value)
    } else {
      setHourly([])
      setLoadError((prev) => prev || 'Impossible de charger les statistiques.')
    }
    if (callsResult.status === 'fulfilled') {
      setLatestCalls(callsResult.value)
    } else {
      setLatestCalls([])
      setLoadError((prev) => prev || 'Impossible de charger les appels récents.')
    }
    if (ovhResult.status === 'fulfilled') {
      setOvhStatus(ovhResult.value)
    } else {
      setOvhStatus(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    reload()
    const ws = new WebSocket(wsUrl())
    ws.onmessage = () => reload()
    const intervalId = window.setInterval(() => {
      reload()
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => {
      ws.close()
      window.clearInterval(intervalId)
    }
  }, [])

  if (loading) return <div>Chargement...</div>
  if (!summary)
    return (
      <div className="card">
        <p className="error">
          {loadError || "Une erreur est survenue lors du chargement du dashboard."}
        </p>
        <button onClick={() => reload()}>Réessayer</button>
      </div>
    )

  const maxHourly = Math.max(1, ...hourly.map((point) => point.total))

  return (
    <div>
      <h2>Dashboard</h2>
      <div className="kpi-section">
        <h3>Aujourd'hui</h3>
        <div className="kpi-grid">
          <Kpi label="📞 Appels" value={summary.today_total} />
          <Kpi label="🚨 Manqués" value={summary.today_missed} />
          <Kpi label="📥 Entrants" value={summary.today_inbound} />
          <Kpi label="📤 Sortants" value={summary.today_outbound} />
          <Kpi label="⏱️ Durée moyenne" value={formatDuration(summary.today_avg_duration)} />
        </div>
      </div>
      <div className="kpi-section">
        <h3>7 jours</h3>
        <div className="kpi-grid">
          <Kpi label="📆 Appels" value={summary.week_total} />
          <Kpi label="😓 Manqués" value={summary.week_missed} />
          <Kpi label="📥 Entrants" value={summary.week_inbound} />
          <Kpi label="📤 Sortants" value={summary.week_outbound} />
          <Kpi label="⏱️ Durée moyenne" value={formatDuration(summary.week_avg_duration)} />
        </div>
      </div>
      {isAdmin && (
        <section className="card">
          <h3>Statut OVH</h3>
          <div className="status-grid">
            <div className="status-item">
              <span>Connexion</span>
              <strong className={ovhStatus?.last_error ? 'status-bad' : 'status-good'}>
                {ovhStatus?.last_error ? '⚠️ Erreur' : '✅ OK'}
              </strong>
            </div>
            <div className="status-item">
              <span>Dernière synchro</span>
              <strong>
                {ovhStatus?.last_sync_at
                  ? new Date(ovhStatus.last_sync_at).toLocaleString()
                  : '⏳ En attente'}
              </strong>
            </div>
            <div className="status-item">
              <span>Dernier message</span>
              <strong className={ovhStatus?.last_error ? 'status-bad' : ''}>
                {ovhStatus?.last_error ? `🧯 ${ovhStatus.last_error}` : 'Rien à signaler'}
              </strong>
            </div>
          </div>
        </section>
      )}
      <section className="card">
        <h3>Appels quotidiens</h3>
        <div className="timeseries">
          {timeseries.map((point) => (
            <div key={point.date} className="timeseries-item">
              <span>{point.date}</span>
              <strong>{point.total}</strong>
              <small>Manqués : {point.missed}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>Appels de la journée par heure</h3>
        <div className="hourly-chart">
          {hourly.map((point) => {
            const height = Math.round((point.total / maxHourly) * 100)
            return (
              <div key={point.hour} className="hourly-bar">
                <strong className="hourly-bar-value">{point.total}</strong>
                <div className="hourly-bar-track">
                  <div className="hourly-bar-fill" style={{ height: `${height}%` }} />
                </div>
                <span className="hourly-bar-label">
                  {String(point.hour).padStart(2, '0')}h
                </span>
              </div>
            )
          })}
        </div>
      </section>
      <section className="card">
        <h3>Derniers appels</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Direction</th>
              <th>Appelant</th>
              <th>Appelé</th>
              <th>Durée</th>
              <th>Statut</th>
              <th>Rappeler</th>
            </tr>
          </thead>
          <tbody>
            {latestCalls.map((call) => (
              <tr key={call.id}>
                <td>{new Date(call.started_at).toLocaleString()}</td>
                <td>{formatDirection(call.direction)}</td>
                <td>{formatFrenchNumber(call.calling_number)}</td>
                <td>{formatFrenchNumber(call.called_number)}</td>
                <td>{call.duration}s</td>
                <td>{formatCallStatus(call)}</td>
                <td>
                  {(() => {
                    const callbackNumber = getCallbackNumber(call)
                    const dialable = toDialableNumber(callbackNumber)
                    return dialable ? (
                      <a className="button-link" href={`tel:${dialable}`}>
                        Rappeler
                      </a>
                    ) : (
                      '—'
                    )
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

const Kpi = ({ label, value }: { label: string; value: number | string }) => (
  <div className="kpi">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
)

const formatDirection = (direction?: string) => {
  const normalized = String(direction ?? '').toLowerCase()
  if (normalized.includes('out')) {
    return '📤 Sortant'
  }
  if (normalized.includes('in')) {
    return '📥 Entrant'
  }
  return '—'
}

const toDialableNumber = (value?: string | null) => {
  if (!value) return ''
  let cleaned = value.replace(/[^+\d]/g, '')
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`
  }
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `+33${cleaned.slice(1)}`
  }
  if (cleaned.startsWith('33') && cleaned.length === 11) {
    return `+${cleaned}`
  }
  return cleaned
}

const formatFrenchNumber = (value?: string | null) => {
  if (!value) return '—'
  let cleaned = value.replace(/[^+\d]/g, '')
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`
  }
  if (cleaned.startsWith('+33')) {
    cleaned = `0${cleaned.slice(3)}`
  } else if (cleaned.startsWith('33') && cleaned.length === 11) {
    cleaned = `0${cleaned.slice(2)}`
  }
  const digits = cleaned.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('0')) {
    return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
  }
  return value
}

const formatDuration = (seconds: number) => {
  if (!seconds || Number.isNaN(seconds)) return '0s'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m ${String(remaining).padStart(2, '0')}s`
}

const getCallbackNumber = (call: any) =>
  call.direction === 'OUTBOUND' ? call.called_number : call.calling_number

const formatCallStatus = (call: any) => {
  if (call.is_missed) {
    return <span className="badge badge-danger">❌ Manqué</span>
  }
  const status = call.status ? String(call.status).toLowerCase() : ''
  if (status.includes('answered') || status.includes('completed')) {
    return <span className="badge badge-success">✅ Répondu</span>
  }
  if (status) {
    return <span className="badge badge-neutral">ℹ️ {call.status}</span>
  }
  return <span className="badge badge-neutral">✅ Répondu</span>
}

type TeamLeadStatus = 'Disponible' | 'En intervention' | 'Indisponible'

type TeamLead = {
  id: string
  teamName: string
  leaderFirstName: string
  leaderLastName: string
  phone: string
  status: TeamLeadStatus
}

const TEAM_LEADS_STORAGE_KEY = 'team-leads'

const loadTeamLeads = (): TeamLead[] => {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(TEAM_LEADS_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const TeamLeads = () => {
  const [teamLeads, setTeamLeads] = useState<TeamLead[]>(() => loadTeamLeads())
  const [formState, setFormState] = useState({
    teamName: '',
    leaderFirstName: '',
    leaderLastName: '',
    phone: '',
    status: 'Disponible' as TeamLeadStatus
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<TeamLeadStatus | ''>('')
  const [teamFilter, setTeamFilter] = useState('')

  const persistTeamLeads = (next: TeamLead[]) => {
    setTeamLeads(next)
    localStorage.setItem(TEAM_LEADS_STORAGE_KEY, JSON.stringify(next))
  }

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === TEAM_LEADS_STORAGE_KEY) {
        setTeamLeads(loadTeamLeads())
      }
    }
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('storage', handler)
    }
  }, [])

  const addTeamLead = () => {
    if (!formState.teamName || !formState.leaderFirstName || !formState.leaderLastName) return
    const next: TeamLead[] = [
      {
        id: crypto.randomUUID(),
        teamName: formState.teamName,
        leaderFirstName: formState.leaderFirstName,
        leaderLastName: formState.leaderLastName,
        phone: formState.phone,
        status: formState.status
      },
      ...teamLeads
    ]
    persistTeamLeads(next)
    setFormState({
      teamName: '',
      leaderFirstName: '',
      leaderLastName: '',
      phone: '',
      status: 'Disponible'
    })
  }

  const updateStatus = (id: string, status: TeamLeadStatus) => {
    const next = teamLeads.map((lead) => (lead.id === id ? { ...lead, status } : lead))
    persistTeamLeads(next)
  }

  const removeLead = (id: string) => {
    const next = teamLeads.filter((lead) => lead.id !== id)
    persistTeamLeads(next)
  }

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredLeads = teamLeads.filter((lead) => {
    if (statusFilter && lead.status !== statusFilter) return false
    if (teamFilter && lead.teamName !== teamFilter) return false
    if (!normalizedSearch) return true
    const haystack = [
      lead.teamName,
      lead.leaderFirstName,
      lead.leaderLastName,
      lead.phone
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalizedSearch)
  })
  const uniqueTeams = Array.from(
    new Set(teamLeads.map((lead) => lead.teamName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'fr'))
  const statusCounts = teamLeads.reduce(
    (acc, lead) => {
      acc.total += 1
      acc[lead.status] += 1
      return acc
    },
    {
      total: 0,
      Disponible: 0,
      'En intervention': 0,
      Indisponible: 0
    } as Record<TeamLeadStatus | 'total', number>
  )

  return (
    <div className="team-board">
      <div className="team-header">
        <div>
          <h2>Moyens d'équipe</h2>
          <p className="team-subtitle">Suivi rapide des équipes et disponibilité en temps réel.</p>
        </div>
        <div className="team-kpis">
          <div className="team-kpi">
            <span>Total</span>
            <strong>{statusCounts.total}</strong>
          </div>
          <div className="team-kpi team-kpi-success">
            <span>Disponible</span>
            <strong>{statusCounts.Disponible}</strong>
          </div>
          <div className="team-kpi team-kpi-warning">
            <span>En intervention</span>
            <strong>{statusCounts['En intervention']}</strong>
          </div>
          <div className="team-kpi team-kpi-danger">
            <span>Indisponible</span>
            <strong>{statusCounts.Indisponible}</strong>
          </div>
        </div>
      </div>
      <section className="card">
        <h3>Ajouter un chef d'équipe</h3>
        <div className="team-form">
          <label>
            Nom d'équipe
            <input
              value={formState.teamName}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, teamName: event.target.value }))
              }
              placeholder="VPSP-1, PSA..."
            />
          </label>
          <label>
            Prénom
            <input
              value={formState.leaderFirstName}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, leaderFirstName: event.target.value }))
              }
              placeholder="Prénom"
            />
          </label>
          <label>
            Nom
            <input
              value={formState.leaderLastName}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, leaderLastName: event.target.value }))
              }
              placeholder="Nom"
            />
          </label>
          <label>
            Téléphone
            <input
              value={formState.phone}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, phone: event.target.value }))
              }
              placeholder="06 00 00 00 00"
            />
          </label>
          <label>
            Statut
            <select
              value={formState.status}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  status: event.target.value as TeamLeadStatus
                }))
              }
            >
              <option value="Disponible">Disponible</option>
              <option value="En intervention">En intervention</option>
              <option value="Indisponible">Indisponible</option>
            </select>
          </label>
          <button type="button" onClick={addTeamLead}>
            Ajouter
          </button>
        </div>
      </section>
      <section className="card">
        <div className="team-summary">
          <div>
            <h3>Moyens disponibles</h3>
            <span>{filteredLeads.length} équipe(s) affichée(s)</span>
          </div>
          <button
            type="button"
            className="button-ghost"
            onClick={() => {
              setSearchTerm('')
              setStatusFilter('')
              setTeamFilter('')
            }}
          >
            Réinitialiser
          </button>
        </div>
        <div className="team-controls">
          <div className="team-search">
            <span aria-hidden="true">🔍</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Rechercher un chef, une équipe ou un numéro..."
            />
          </div>
          <label>
            Statut
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as TeamLeadStatus | '')}
            >
              <option value="">Tous</option>
              <option value="Disponible">Disponible</option>
              <option value="En intervention">En intervention</option>
              <option value="Indisponible">Indisponible</option>
            </select>
          </label>
          <label>
            Équipe
            <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
              <option value="">Toutes</option>
              {uniqueTeams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>
        </div>
        {teamLeads.length === 0 ? (
          <p>Aucun chef d'équipe enregistré.</p>
        ) : filteredLeads.length === 0 ? (
          <p>Aucun résultat avec ces filtres.</p>
        ) : (
          <div className="team-grid">
            {filteredLeads.map((lead) => {
              const dialable = toDialableNumber(lead.phone)
              return (
                <div key={lead.id} className="team-card">
                  <div className="team-card-header">
                    <div>
                      <strong>{lead.teamName}</strong>
                      <p>
                        {lead.leaderFirstName} {lead.leaderLastName}
                      </p>
                    </div>
                    <span className={`team-status team-status-${lead.status.replace(' ', '-')}`}>
                      {lead.status}
                    </span>
                  </div>
                  <div className="team-card-body">
                    <div className="team-card-row">
                      <span>Téléphone</span>
                      <strong>{formatFrenchNumber(lead.phone)}</strong>
                    </div>
                    <label>
                      Statut
                      <select
                        value={lead.status}
                        onChange={(event) =>
                          updateStatus(lead.id, event.target.value as TeamLeadStatus)
                        }
                      >
                        <option value="Disponible">Disponible</option>
                        <option value="En intervention">En intervention</option>
                        <option value="Indisponible">Indisponible</option>
                      </select>
                    </label>
                  </div>
                  <div className="team-card-actions">
                    {dialable ? (
                      <a className="button-link" href={`tel:${dialable}`}>
                        Appeler
                      </a>
                    ) : (
                      <span className="button-link disabled">Appeler</span>
                    )}
                    <button type="button" className="button-danger" onClick={() => removeLead(lead.id)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

const Calls = ({ token, isAdmin }: { token: string; isAdmin: boolean }) => {
  const [calls, setCalls] = useState<any[]>([])
  const [filters, setFilters] = useState({
    number: '',
    direction: '',
    missed: '',
    start_date: '',
    end_date: ''
  })
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    const data = await fetchCalls(token, { page, page_size: 20, ...filters })
    setCalls(data)
  }, [token, page, filters])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const ws = new WebSocket(wsUrl())
    ws.onmessage = () => load()
    const intervalId = window.setInterval(() => {
      load()
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => {
      ws.close()
      window.clearInterval(intervalId)
    }
  }, [load])

  return (
    <div>
      <h2>Appels</h2>
      <div className="filters">
        <input
          placeholder="Numéro"
          value={filters.number}
          onChange={(e) => setFilters({ ...filters, number: e.target.value })}
        />
        <select
          value={filters.direction}
          onChange={(e) => setFilters({ ...filters, direction: e.target.value })}
        >
          <option value="">Direction</option>
          <option value="INBOUND">Entrant</option>
          <option value="OUTBOUND">Sortant</option>
        </select>
        <select
          value={filters.missed}
          onChange={(e) => setFilters({ ...filters, missed: e.target.value })}
        >
          <option value="">Manqués</option>
          <option value="true">Oui</option>
          <option value="false">Non</option>
        </select>
        <input
          type="date"
          value={filters.start_date}
          onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
        />
        <input
          type="date"
          value={filters.end_date}
          onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
        />
        <button onClick={() => load()}>Filtrer</button>
        {isAdmin && (
          <button onClick={() => exportCallsCsv(token, filters)}>Export CSV</button>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Direction</th>
            <th>Appelant</th>
            <th>Appelé</th>
              <th>Durée</th>
              <th>Statut</th>
              <th>Manqué</th>
              <th>Rappeler</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id}>
                <td>{new Date(call.started_at).toLocaleString()}</td>
                <td>{formatDirection(call.direction)}</td>
                <td>{formatFrenchNumber(call.calling_number)}</td>
                <td>{formatFrenchNumber(call.called_number)}</td>
                <td>{call.duration}s</td>
                <td>{formatCallStatus(call)}</td>
                <td>{call.is_missed ? 'Oui' : 'Non'}</td>
                <td>
                  {(() => {
                    const callbackNumber = getCallbackNumber(call)
                    const dialable = toDialableNumber(callbackNumber)
                    return dialable ? (
                      <a className="button-link" href={`tel:${dialable}`}>
                        Rappeler
                      </a>
                    ) : (
                      '—'
                    )
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      <div className="pagination">
        <button onClick={() => setPage(Math.max(1, page - 1))}>Précédent</button>
        <span>Page {page}</span>
        <button onClick={() => setPage(page + 1)}>Suivant</button>
      </div>
    </div>
  )
}

const Users = ({ token }: { token: string }) => {
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ username: '', password: '', role: 'OPERATEUR' })

  const load = async () => {
    const data = await fetchUsers(token)
    setUsers(data)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <h2>Utilisateurs</h2>
      <div className="card">
        <h3>Créer un utilisateur</h3>
        <input
          placeholder="Nom d'utilisateur"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="OPERATEUR">OPERATEUR</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <button
          onClick={async () => {
            await createUser(token, form)
            setForm({ username: '', password: '', role: 'OPERATEUR' })
            load()
          }}
        >
          Ajouter
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Rôle</th>
            <th>Changement MDP</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.username}</td>
              <td>{user.role}</td>
              <td>
                <input
                  type="checkbox"
                  checked={user.must_change_password}
                  onChange={async (e) => {
                    await updateUser(token, user.id, { must_change_password: e.target.checked })
                    load()
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const OvhSettings = ({ token }: { token: string }) => {
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<any>(null)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isForbidden, setIsForbidden] = useState(false)
  const [testLogs, setTestLogs] = useState<string[]>([])
  const [syncStatus, setSyncStatus] = useState<'idle' | 'pending' | 'error'>('idle')

  const formatSyncTime = (value?: string | null) => {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString()
  }

  const load = async () => {
    setErrorMessage('')
    setIsForbidden(false)
    try {
      const data = await fetchOvhSettings(token)
      setSettings(data)
    } catch (error) {
      const err = error as Error & { status?: number }
      setSettings(null)
      if (err.status === 403) {
        setIsForbidden(true)
      }
      setErrorMessage(err.message || 'Impossible de charger les paramètres OVH.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const ws = new WebSocket(wsUrl())
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'sync_complete') {
          setSyncStatus('idle')
          setMessage(
            data.payload?.new_count
              ? `Synchronisation terminée (${data.payload.new_count} nouvel(s) appel(s))`
              : 'Synchronisation terminée'
          )
          load()
        }
        if (data.type === 'sync_error') {
          setSyncStatus('error')
          setErrorMessage(data.payload?.message || 'Erreur de synchronisation')
          load()
        }
      } catch {
        load()
      }
    }
    return () => ws.close()
  }, [])

  if (loading) return <div>Chargement...</div>
  if (!settings)
    return (
      <div className="card">
        <p className="error">
          {errorMessage || "Impossible de charger les paramètres OVH."}
        </p>
        {isForbidden ? (
          <p>
            Seuls les comptes administrateurs peuvent accéder à ce menu. Revenez
            à un compte <strong>ADMIN</strong> ou demandez l'accès.
          </p>
        ) : (
          <button onClick={() => load()}>Réessayer</button>
        )}
      </div>
    )

  return (
    <div>
      <h2>Paramètres OVH</h2>
      <div className="card">
        <label>
          Billing account
          <input
            value={settings.billing_account || ''}
            onChange={(e) => setSettings({ ...settings, billing_account: e.target.value })}
          />
        </label>
        <label>
          Service names (séparés par des virgules)
          <input
            value={settings.service_names || ''}
            onChange={(e) => setSettings({ ...settings, service_names: e.target.value })}
          />
        </label>
        <label>
          Numéro admin (appelant sortant)
          <input
            placeholder="Ex: +33123456789"
            value={settings.admin_phone_number || ''}
            onChange={(e) =>
              setSettings({ ...settings, admin_phone_number: e.target.value })
            }
          />
          <small>Exemple attendu: +33612345678 (format international conseillé).</small>
        </label>
        <label>
          App key
          <input
            value={settings.app_key || ''}
            onChange={(e) => setSettings({ ...settings, app_key: e.target.value })}
          />
        </label>
        <label>
          App secret
          <input
            type="password"
            value={settings.app_secret || ''}
            onChange={(e) => setSettings({ ...settings, app_secret: e.target.value })}
          />
        </label>
        <label>
          Consumer key
          <input
            value={settings.consumer_key || ''}
            onChange={(e) => setSettings({ ...settings, consumer_key: e.target.value })}
          />
        </label>
        <div className="row">
          <button
            onClick={async () => {
              const data = await saveOvhSettings(token, settings)
              setSettings(data)
              setMessage('Paramètres sauvegardés')
            }}
          >
            Enregistrer
          </button>
          <button
            onClick={async () => {
              setMessage('')
              setErrorMessage('')
              setTestLogs([])
              try {
                const result = await testOvhSettings(token)
                setMessage('Connexion OK')
                setTestLogs(result?.logs || [])
              } catch (error) {
                const err = error as Error & { logs?: string[] }
                setErrorMessage(err.message || 'Test failed')
                setTestLogs(err.logs || [])
              }
            }}
          >
            Tester connexion
          </button>
        </div>
        <div className="row">
          <button
            onClick={async () => {
              setMessage('')
              setErrorMessage('')
              setMessage('Synchronisation en cours...')
              setSyncStatus('pending')
              try {
                await triggerSync(token)
              } catch (error) {
                const err = error as Error
                setErrorMessage(err.message || 'Erreur lors de la synchronisation')
                setSyncStatus('error')
              }
            }}
            disabled={syncStatus === 'pending'}
          >
            {syncStatus === 'pending' ? 'Synchronisation en cours...' : 'Forcer la sync'}
          </button>
        </div>
        <p>Dernière sync: {formatSyncTime(settings.last_sync_at)}</p>
        <p>Erreurs récentes: {settings.last_error || '—'}</p>
        {message && <p className="success">{message}</p>}
        {errorMessage && <p className="error">{errorMessage}</p>}
        {testLogs.length > 0 && (
          <div className="log-block">
            <p>Logs de test:</p>
            <pre>{testLogs.join('\n')}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

const SyncDebug = ({ token }: { token: string }) => {
  const [days, setDays] = useState(7)
  const [logs, setLogs] = useState<string[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const runDiagnostic = async (mode: 'dry_run' | 'force_sync') => {
    setStatus('running')
    setMessage('')
    setErrorMessage('')
    setLogs([])
    setSummary(null)
    try {
      const result = await debugSync(token, { days, mode })
      setSummary(result?.summary || null)
      setLogs(result?.logs || [])
      setMessage(
        mode === 'force_sync'
          ? 'Synchronisation poussée terminée.'
          : 'Diagnostic terminé.'
      )
      setStatus('idle')
    } catch (error) {
      const err = error as Error & { logs?: string[] }
      setErrorMessage(err.message || 'Erreur lors du diagnostic')
      setLogs(err.logs || [])
      setStatus('error')
    }
  }

  return (
    <div>
      <h2>Debug synchronisation</h2>
      <div className="card">
        <p>
          Ce diagnostic vérifie la fenêtre de synchronisation, l'accès OVH et
          les consommations détectées pour comprendre ce qui bloque.
        </p>
        <label>
          Fenêtre d'analyse (jours)
          <input
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <div className="row">
          <button onClick={() => runDiagnostic('dry_run')} disabled={status === 'running'}>
            Lancer diagnostic
          </button>
          <button onClick={() => runDiagnostic('force_sync')} disabled={status === 'running'}>
            Synchronisation poussée
          </button>
        </div>
        {summary && (
          <div className="debug-summary">
            <p>Résumé:</p>
            <ul>
              <li>Période: {summary.range_start} → {summary.range_end}</li>
              <li>Consommations: {summary.consumption_count ?? '—'}</li>
              <li>Appels en base (fenêtre): {summary.db_count ?? '—'}</li>
              <li>Manqués en base (fenêtre): {summary.db_missed_count ?? '—'}</li>
              <li>Déjà en base: {summary.existing_count ?? '—'}</li>
              <li>Nouveaux potentiels: {summary.new_count ?? '—'}</li>
              {summary.sync_new_count !== undefined && (
                <li>Nouveaux synchronisés: {summary.sync_new_count}</li>
              )}
            </ul>
          </div>
        )}
        {message && <p className="success">{message}</p>}
        {errorMessage && <p className="error">{errorMessage}</p>}
        {logs.length > 0 && (
          <div className="log-block">
            <p>Logs de diagnostic:</p>
            <pre>{logs.join('\n')}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
