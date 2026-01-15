import { useCallback, useEffect, useState } from 'react'
import {
  changePassword,
  createTeamLeadCategory,
  createUser,
  createTeamLead,
  deleteTeamLeadCategory,
  deleteTeamLead,
  exportCallsCsv,
  fetchCalls,
  fetchDashboardSummary,
  fetchDashboardHourly,
  fetchTeamLeadCategories,
  fetchTeamLeads,
  fetchMe,
  fetchOvhSettings,
  fetchUsers,
  login,
  saveOvhSettings,
  testOvhSettings,
  triggerSync,
  updateTeamLeadCategory,
  updateTeamLead,
  updateUser
} from './api'
import protectionCivileLogo from './assets/protection-civile-logo.svg'

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
  changePassword: 'Changer mot de passe'
}

const wsUrl = (token: string) => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`
}

const AUTO_REFRESH_INTERVAL_MS = 2000
const TOKEN_STORAGE_KEY = 'telephonievoip_token'
const PAGE_STORAGE_KEY = 'telephonievoip_page'
const SIDEBAR_STORAGE_KEY = 'telephonievoip_sidebar_collapsed'

type PageKey = keyof typeof pages

const getStoredPage = (): PageKey => {
  if (typeof window === 'undefined') {
    return 'dashboard'
  }
  const stored = window.localStorage.getItem(PAGE_STORAGE_KEY)
  if (stored && stored in pages) {
    return stored as PageKey
  }
  return 'dashboard'
}

const App = () => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null
    }
    return window.localStorage.getItem(TOKEN_STORAGE_KEY)
  })
  const [user, setUser] = useState<User | null>(null)
  const [page, setPage] = useState<PageKey>(() => getStoredPage())
  const [error, setError] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  })

  useEffect(() => {
    if (!token) {
      setUser(null)
      setAuthReady(true)
      return
    }
    setAuthReady(false)
    fetchMe(token)
      .then((me) => {
        setUser(me)
        setAuthReady(true)
      })
      .catch(() => {
        setUser(null)
        setToken(null)
        setAuthReady(true)
      })
  }, [token])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  }, [token])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(PAGE_STORAGE_KEY, page)
  }, [page])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    if (!user) {
      return
    }
    if (!isAdmin && (page === 'users' || page === 'settings')) {
      setPage('dashboard')
    }
  }, [isAdmin, page, user])

  if (!token) {
    return (
      <Login
        onLogin={async (username, password) => {
          setError('')
          try {
            const result = await login(username, password)
            setToken(result.access_token)
          } catch (err) {
            setError('Identifiants invalides')
          }
        }}
        error={error}
      />
    )
  }

  if (!authReady || !user) {
    return <div className="loading">Vérification de la session...</div>
  }

  return (
    <div className={`app ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <h1>Secours Calls</h1>
        <nav>
          <button
            className={page === 'dashboard' ? 'is-active' : ''}
            onClick={() => setPage('dashboard')}
          >
            Dashboard
          </button>
          <button className={page === 'calls' ? 'is-active' : ''} onClick={() => setPage('calls')}>
            Appels
          </button>
          <button className={page === 'teams' ? 'is-active' : ''} onClick={() => setPage('teams')}>
            Moyens d'équipe
          </button>
          {isAdmin && (
            <button
              className={page === 'users' ? 'is-active' : ''}
              onClick={() => setPage('users')}
            >
              Utilisateurs
            </button>
          )}
          {isAdmin && (
            <button
              className={page === 'settings' ? 'is-active' : ''}
              onClick={() => setPage('settings')}
            >
              Paramètres OVH
            </button>
          )}
        </nav>
        <div className="sidebar-footer">
          <span>{user?.username}</span>
          <button
            onClick={() => {
              setUser(null)
              setToken(null)
            }}
          >
            Déconnexion
          </button>
        </div>
      </aside>
      <main>
        <div className="layout-toolbar">
          <button
            type="button"
            className="button-ghost"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
          >
            {isSidebarCollapsed ? 'Afficher le menu' : 'Masquer le menu'}
          </button>
        </div>
        {page === 'dashboard' && <Dashboard token={token} isAdmin={isAdmin} />}
        {page === 'calls' && <Calls token={token} isAdmin={isAdmin} />}
        {page === 'teams' && <TeamLeads token={token} />}
        {page === 'users' && isAdmin && <Users token={token} />}
        {page === 'settings' && isAdmin && <OvhSettings token={token} />}
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
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src={protectionCivileLogo} alt="Protection Civile Isère" />
        </div>
        <div className="login-header">
          <h2>Connexion</h2>
          <p>Accédez à la plateforme de téléphonie d&apos;urgence.</p>
        </div>
        <form
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            onLogin(username, password)
          }}
        >
          <label>
            Nom d&apos;utilisateur
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              placeholder="prenom.nom"
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Se connecter</button>
        </form>
        <p className="login-help">
          Besoin d&apos;aide ? Contactez le support régional.
        </p>
      </div>
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
  const [hourly, setHourly] = useState<{ hour: number; total: number }[]>([])
  const [latestCalls, setLatestCalls] = useState<any[]>([])
  const [latestCallsFilters, setLatestCallsFilters] = useState({
    start_date: '',
    end_date: ''
  })

  const reload = async () => {
    const results = await Promise.allSettled([
      fetchDashboardSummary(token),
      fetchDashboardHourly(token),
      fetchCalls(token, { page: 1, page_size: 5, ...latestCallsFilters })
    ])
    const [summaryResult, hourlyResult, callsResult] = results
    setLoadError('')
    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value)
    } else {
      setSummary(null)
      setLoadError('Impossible de charger le dashboard. Vérifiez la connexion.')
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
    setLoading(false)
  }

  useEffect(() => {
    reload()
    const ws = new WebSocket(wsUrl(token))
    ws.onmessage = () => reload()
    const intervalId = window.setInterval(() => {
      reload()
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => {
      ws.close()
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [latestCallsFilters])

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
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Vue d'ensemble en temps réel des appels et performances.</p>
        </div>
        <button type="button" className="button-ghost" onClick={() => reload()}>
          Rafraîchir
        </button>
      </div>
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
        <div className="card-header">
          <h3>Derniers appels</h3>
          <button
            type="button"
            onClick={() => {
              const today = getTodayDate()
              setLatestCallsFilters({ start_date: today, end_date: today })
            }}
          >
            Filtrer aujourd'hui
          </button>
        </div>
        <div className="table-wrapper">
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
                  <td>{formatCallParty(call, 'calling')}</td>
                  <td>{formatCallParty(call, 'called')}</td>
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
        </div>
      </section>
      <section className="card">
        <h3>Infos utiles</h3>
        <div className="status-grid">
          <div className="status-item">
            <span>Taux de réponse aujourd'hui</span>
            <strong>
              {summary.today_total
                ? `${Math.round(
                    ((summary.today_total - summary.today_missed) / summary.today_total) * 100
                  )}%`
                : '—'}
            </strong>
          </div>
          <div className="status-item">
            <span>Total appels 7 jours</span>
            <strong>{summary.week_total}</strong>
          </div>
          <div className="status-item">
            <span>Durée moyenne 7 jours</span>
            <strong>{formatDuration(summary.week_avg_duration)}</strong>
          </div>
        </div>
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

const formatCallParty = (call: any, side: 'calling' | 'called') => {
  const teamName = call[`${side}_team_name`]
  const leaderFirstName = call[`${side}_leader_first_name`]
  if (teamName && leaderFirstName) {
    return `${teamName} - ${leaderFirstName}`
  }
  if (teamName) {
    return teamName
  }
  if (leaderFirstName) {
    return leaderFirstName
  }
  const number = side === 'calling' ? call.calling_number : call.called_number
  return formatFrenchNumber(number)
}

const formatDuration = (seconds: number) => {
  if (!seconds || Number.isNaN(seconds)) return '0s'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m ${String(remaining).padStart(2, '0')}s`
}

const getTodayDate = () => {
  const today = new Date()
  return today.toISOString().slice(0, 10)
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

type TeamLeadStatus = string

type TeamLead = {
  id: number
  teamName: string
  leaderFirstName: string
  leaderLastName: string
  phone: string
  status: TeamLeadStatus
  categoryId: number | null
}

type TeamLeadCategory = {
  id: number
  name: string
  position: number
}

const knownStatusClasses: Record<string, string> = {
  Disponible: 'Disponible',
  'En intervention': 'En-intervention',
  Indisponible: 'Indisponible'
}

const baseStatusOptions = ['Disponible', 'En intervention', 'Indisponible']

const TeamLeads = ({ token }: { token: string }) => {
  const [teamLeads, setTeamLeads] = useState<TeamLead[]>([])
  const [categories, setCategories] = useState<TeamLeadCategory[]>([])
  const [loadError, setLoadError] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [formState, setFormState] = useState({
    teamName: '',
    teamEmoji: '',
    leaderFirstName: '',
    leaderLastName: '',
    phone: '',
    status: 'Disponible' as TeamLeadStatus,
    categoryId: null as number | null
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<TeamLeadStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState<number | 'uncategorized' | ''>('')
  const [teamFilter, setTeamFilter] = useState('')
  const [categoryEdits, setCategoryEdits] = useState<Record<number, string>>({})
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showTeamFilters, setShowTeamFilters] = useState(true)

  const loadTeamLeads = useCallback(async () => {
    try {
      const data = await fetchTeamLeads(token)
      const mapped = data.map((lead: any) => ({
        id: lead.id,
        teamName: lead.team_name,
        leaderFirstName: lead.leader_first_name,
        leaderLastName: lead.leader_last_name,
        phone: lead.phone ?? '',
        status: lead.status as TeamLeadStatus,
        categoryId: lead.category_id ?? null
      }))
      setTeamLeads(mapped)
      setLoadError('')
    } catch (error) {
      setLoadError("Impossible de charger les moyens d'équipe.")
    }
  }, [token])

  const loadCategories = useCallback(async () => {
    try {
      const data = await fetchTeamLeadCategories(token)
      const mapped = data.map((category: any) => ({
        id: category.id,
        name: category.name,
        position: category.position
      }))
      setCategories(mapped)
      setCategoryEdits((prev) =>
        mapped.reduce((acc: Record<number, string>, category: TeamLeadCategory) => {
          const current = prev[category.id]
          acc[category.id] =
            current !== undefined && current.trim() !== category.name ? current : category.name
          return acc
        }, {})
      )
      setCategoryError('')
    } catch (error) {
      setCategoryError('Impossible de charger les catégories.')
    }
  }, [token])

  useEffect(() => {
    loadTeamLeads()
    loadCategories()
    const ws = new WebSocket(wsUrl(token))
    ws.onmessage = () => {
      loadTeamLeads()
      loadCategories()
    }
    const intervalId = window.setInterval(() => {
      loadTeamLeads()
      loadCategories()
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => {
      ws.close()
      window.clearInterval(intervalId)
    }
  }, [loadCategories, loadTeamLeads])

  useEffect(() => {
    if (!categories.length) {
      if (formState.categoryId !== null) {
        setFormState((prev) => ({ ...prev, categoryId: null }))
      }
      return
    }
    const categoryIds = categories.map((category) => category.id)
    if (!formState.categoryId || !categoryIds.includes(formState.categoryId)) {
      setFormState((prev) => ({ ...prev, categoryId: categoryIds[0] }))
    }
  }, [categories, formState.categoryId])

  const addTeamLead = async () => {
    if (!formState.teamName || !formState.leaderFirstName || !formState.leaderLastName) return
    const decoratedTeamName = formState.teamEmoji
      ? `${formState.teamEmoji} ${formState.teamName}`
      : formState.teamName
    const created = await createTeamLead(token, {
      team_name: decoratedTeamName,
      leader_first_name: formState.leaderFirstName,
      leader_last_name: formState.leaderLastName,
      phone: formState.phone,
      status: formState.status,
      category_id: formState.categoryId
    })
    setTeamLeads((prev) => [
      {
        id: created.id,
        teamName: created.team_name,
        leaderFirstName: created.leader_first_name,
        leaderLastName: created.leader_last_name,
        phone: created.phone ?? '',
        status: created.status,
        categoryId: created.category_id ?? null
      },
      ...prev
    ])
    setFormState({
      teamName: '',
      teamEmoji: '',
      leaderFirstName: '',
      leaderLastName: '',
      phone: '',
      status: 'Disponible',
      categoryId: categories.length ? categories[0].id : null
    })
  }

  const updateStatus = async (id: number, status: TeamLeadStatus) => {
    const updated = await updateTeamLead(token, id, { status })
    setTeamLeads((prev) =>
      prev.map((lead) => (lead.id === id ? { ...lead, status: updated.status } : lead))
    )
  }

  const updateCategory = async (id: number, categoryId: number | null) => {
    const updated = await updateTeamLead(token, id, { category_id: categoryId })
    setTeamLeads((prev) =>
      prev.map((lead) =>
        lead.id === id
          ? { ...lead, categoryId: updated.category_id ?? null }
          : lead
      )
    )
  }

  const removeLead = async (id: number) => {
    await deleteTeamLead(token, id)
    setTeamLeads((prev) => prev.filter((lead) => lead.id !== id))
  }

  const createCategory = async () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    try {
      await createTeamLeadCategory(token, { name: trimmed })
      setNewCategoryName('')
      loadCategories()
    } catch (error) {
      setCategoryError("Impossible d'ajouter la catégorie.")
    }
  }

  const saveCategory = async (category: TeamLeadCategory) => {
    const nextName = categoryEdits[category.id]?.trim()
    if (!nextName || nextName === category.name) return
    try {
      await updateTeamLeadCategory(token, category.id, { name: nextName })
      loadCategories()
      loadTeamLeads()
    } catch (error) {
      setCategoryError("Impossible de mettre à jour la catégorie.")
    }
  }

  const removeCategory = async (category: TeamLeadCategory) => {
    if (!window.confirm(`Supprimer la catégorie "${category.name}" ?`)) return
    try {
      await deleteTeamLeadCategory(token, category.id)
      loadCategories()
    } catch (error) {
      setCategoryError("Impossible de supprimer la catégorie.")
    }
  }

  const orderedCategories = [...categories].sort((a, b) => a.position - b.position)
  const uncategorizedLabel = 'Sans catégorie'
  const hasUncategorized = teamLeads.some((lead) => !lead.categoryId)
  const categoryColumns = [
    ...orderedCategories.map((category) => ({
      id: category.id,
      key: String(category.id),
      name: category.name
    })),
    ...(hasUncategorized
      ? [
          {
            id: null,
            key: 'uncategorized',
            name: uncategorizedLabel
          }
        ]
      : [])
  ]

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredLeads = teamLeads.filter((lead) => {
    if (statusFilter && lead.status !== statusFilter) return false
    if (categoryFilter) {
      if (categoryFilter === 'uncategorized' && lead.categoryId) return false
      if (categoryFilter !== 'uncategorized' && lead.categoryId !== categoryFilter)
        return false
    }
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
  const categoryCounts = teamLeads.reduce(
    (acc, lead) => {
      acc.total += 1
      const key = lead.categoryId ? String(lead.categoryId) : 'uncategorized'
      acc[key] = (acc[key] || 0) + 1
      return acc
    },
    { total: 0 } as Record<string, number>
  )
  const statusOptions = Array.from(
    new Set([...baseStatusOptions, ...teamLeads.map((lead) => lead.status).filter(Boolean)])
  )
  const visibleCategoryColumns = categoryFilter
    ? categoryColumns.filter((category) => {
        if (categoryFilter === 'uncategorized') {
          return category.key === 'uncategorized'
        }
        return category.id === categoryFilter
      })
    : categoryColumns

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
            <strong>{categoryCounts.total}</strong>
          </div>
          {categoryColumns.map((category) => (
            <div key={category.key} className="team-kpi team-kpi-neutral">
              <span>{category.name}</span>
              <strong>{categoryCounts[category.key] || 0}</strong>
            </div>
          ))}
        </div>
      </div>
      {loadError && <p className="error">{loadError}</p>}
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
            Emoji d'équipe
            <select
              value={formState.teamEmoji}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, teamEmoji: event.target.value }))
              }
            >
              <option value="">Aucun</option>
              <option value="🚑">🚑 Ambulance</option>
              <option value="🚙">🚙 4x4</option>
              <option value="⛺">⛺ Tente secours</option>
              <option value="⛑️">⛑️ Secouriste</option>
            </select>
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
            Disponibilité
            <select
              value={formState.status}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  status: event.target.value as TeamLeadStatus
                }))
              }
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Catégorie
            <select
              value={formState.categoryId ?? ''}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  categoryId: event.target.value ? Number(event.target.value) : null
                }))
              }
            >
              <option value="">Aucune</option>
              {orderedCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
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
          <div className="team-summary-actions">
            <button
              type="button"
              className="button-ghost"
              onClick={() => setShowTeamFilters((prev) => !prev)}
            >
              {showTeamFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
            </button>
            <button
              type="button"
              className="button-ghost"
              onClick={() => {
                setSearchTerm('')
                setStatusFilter('')
                setTeamFilter('')
                setCategoryFilter('')
              }}
            >
              Réinitialiser
            </button>
          </div>
        </div>
        {showTeamFilters && (
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
              Disponibilité
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as TeamLeadStatus | '')}
              >
                <option value="">Toutes</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Catégorie
              <select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(
                    event.target.value
                      ? event.target.value === 'uncategorized'
                        ? 'uncategorized'
                        : Number(event.target.value)
                      : ''
                  )
                }
              >
                <option value="">Toutes</option>
                {orderedCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
                {hasUncategorized && (
                  <option value="uncategorized">{uncategorizedLabel}</option>
                )}
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
        )}
        <div className="team-kanban">
          <aside className="team-kanban-sidebar">
            <div className="team-kanban-title">
              <h4>Catégories</h4>
              <span>{orderedCategories.length} active(s)</span>
            </div>
            {categoryError && <p className="error">{categoryError}</p>}
            {orderedCategories.length === 0 ? (
              <p className="team-empty">Ajoutez une première catégorie pour organiser le Kanban.</p>
            ) : (
              <div className="team-category-list">
                {orderedCategories.map((category) => {
                  const count = categoryCounts[String(category.id)] || 0
                  return (
                    <div key={category.id} className="team-category-item">
                      <input
                        value={categoryEdits[category.id] ?? category.name}
                        onChange={(event) =>
                          setCategoryEdits((prev) => ({
                            ...prev,
                            [category.id]: event.target.value
                          }))
                        }
                      />
                      <div className="team-category-meta">
                        <span>{count} chef(s)</span>
                        <div className="team-category-actions">
                          <button
                            type="button"
                            onClick={() => saveCategory(category)}
                            disabled={
                              !categoryEdits[category.id] ||
                              categoryEdits[category.id].trim() === category.name
                            }
                          >
                            Enregistrer
                          </button>
                          <button
                            type="button"
                            className="button-danger"
                            onClick={() => removeCategory(category)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="team-category-add">
              <input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Nouvelle catégorie"
              />
              <button type="button" onClick={createCategory}>
                Ajouter
              </button>
            </div>
            <p className="team-hint">
              Glissez-déposez les cartes pour changer la catégorie en temps réel.
            </p>
          </aside>
          <div className="team-kanban-board">
            {teamLeads.length === 0 && (
              <p className="team-empty-banner">Aucun chef d'équipe enregistré.</p>
            )}
            {teamLeads.length > 0 && filteredLeads.length === 0 && (
              <p className="team-empty-banner">Aucun résultat avec ces filtres.</p>
            )}
            {categoryColumns.length === 0 ? (
              <p className="team-empty-banner">Ajoutez une catégorie pour activer le Kanban.</p>
            ) : (
              <div className="team-columns">
                {visibleCategoryColumns.map((category) => {
                  const columnLeads = filteredLeads.filter((lead) =>
                    category.id === null ? !lead.categoryId : lead.categoryId === category.id
                  )
                  const statusClass = knownStatusClasses[category.name]
                  return (
                    <div
                      key={category.key}
                      className="team-column"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        const id = Number(event.dataTransfer.getData('text/plain'))
                        if (id) {
                          updateCategory(id, category.id)
                        }
                      }}
                    >
                      <div className="team-column-header">
                        <div className="team-column-title">
                          <span
                            className={`team-status-dot ${
                              statusClass ? `team-status-dot-${statusClass}` : ''
                            }`}
                            aria-hidden="true"
                          />
                          <h4>{category.name}</h4>
                        </div>
                        <span className="team-column-count">{columnLeads.length}</span>
                      </div>
                      <div className="team-column-body">
                        {columnLeads.length === 0 ? (
                          <p className="team-empty">Aucun chef dans cette colonne.</p>
                        ) : (
                          columnLeads.map((lead) => {
                            const dialable = toDialableNumber(lead.phone)
                            const leadStatusClass = knownStatusClasses[lead.status]
                            return (
                              <div
                                key={lead.id}
                                className="team-card"
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.setData('text/plain', String(lead.id))
                                  event.dataTransfer.effectAllowed = 'move'
                                }}
                              >
                                <div className="team-card-header">
                                  <div>
                                    <div className="team-card-title">
                                      <span
                                        className={`team-status-dot ${
                                          leadStatusClass
                                            ? `team-status-dot-${leadStatusClass}`
                                            : ''
                                        }`}
                                        aria-hidden="true"
                                      />
                                      <strong>{lead.teamName}</strong>
                                    </div>
                                    <p>
                                      {lead.leaderFirstName} {lead.leaderLastName}
                                    </p>
                                  </div>
                                  <span
                                    className={`team-status ${
                                      leadStatusClass ? `team-status-${leadStatusClass}` : ''
                                    }`}
                                  >
                                    {lead.status}
                                  </span>
                                </div>
                                <div className="team-card-body">
                                  <div className="team-card-row">
                                    <span>Téléphone</span>
                                    <strong>{formatFrenchNumber(lead.phone)}</strong>
                                  </div>
                                  <label>
                                    Disponibilité
                                    <select
                                      value={lead.status}
                                      onChange={(event) =>
                                        updateStatus(
                                          lead.id,
                                          event.target.value as TeamLeadStatus
                                        )
                                      }
                                    >
                                      {statusOptions.map((status) => (
                                        <option key={status} value={status}>
                                          {status}
                                        </option>
                                      ))}
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
                                  <button
                                    type="button"
                                    className="button-danger"
                                    onClick={() => removeLead(lead.id)}
                                  >
                                    Supprimer
                                  </button>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

const Calls = ({ token, isAdmin }: { token: string; isAdmin: boolean }) => {
  const [calls, setCalls] = useState<any[]>([])
  const initialFilters = {
    number: '',
    direction: '',
    missed: '',
    start_date: '',
    end_date: ''
  }
  const [filters, setFilters] = useState(initialFilters)
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(true)

  const load = useCallback(async () => {
    const data = await fetchCalls(token, { page, page_size: 20, ...filters })
    setCalls(data)
  }, [token, page, filters])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const ws = new WebSocket(wsUrl(token))
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
      <div className="page-header">
        <div>
          <h2>Appels</h2>
          <p>Analyse détaillée des appels entrants et sortants.</p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="button-ghost"
            onClick={() => setShowFilters((prev) => !prev)}
          >
            {showFilters ? 'Masquer les filtres' : 'Afficher les filtres'}
          </button>
          {isAdmin && (
            <button className="button-ghost" onClick={() => exportCallsCsv(token, filters)}>
              Export CSV
            </button>
          )}
        </div>
      </div>
      {showFilters && (
        <section className="card filters-card">
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
            <button
              type="button"
              className="button-ghost"
              onClick={() => {
                setFilters(initialFilters)
                setPage(1)
              }}
            >
              Réinitialiser
            </button>
            <button
              type="button"
              className="button-ghost"
              onClick={() => {
                const today = getTodayDate()
                setFilters({ ...filters, start_date: today, end_date: today })
                setPage(1)
              }}
            >
              Aujourd'hui
            </button>
          </div>
        </section>
      )}
      <div className="table-wrapper">
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
                <td>{formatCallParty(call, 'calling')}</td>
                <td>{formatCallParty(call, 'called')}</td>
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
      </div>
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
  const [passwords, setPasswords] = useState<Record<number, string>>({})

  const load = async () => {
    const data = await fetchUsers(token)
    setUsers(data)
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Utilisateurs</h2>
          <p>Gérez les comptes et les droits d'accès.</p>
        </div>
      </div>
      <div className="card">
        <h3>Créer un utilisateur</h3>
        <div className="form-grid">
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
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Rôle</th>
            <th>Changement MDP</th>
            <th>Nouveau MDP</th>
            <th>Action</th>
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
              <td>
                <input
                  type="password"
                  placeholder="Nouveau mot de passe"
                  value={passwords[user.id] || ''}
                  onChange={(e) =>
                    setPasswords((prev) => ({ ...prev, [user.id]: e.target.value }))
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  disabled={!passwords[user.id]}
                  onClick={async () => {
                    await updateUser(token, user.id, { password: passwords[user.id] })
                    setPasswords((prev) => ({ ...prev, [user.id]: '' }))
                    load()
                  }}
                >
                  Modifier MDP
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
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
    const ws = new WebSocket(wsUrl(token))
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
      <div className="page-header">
        <div>
          <h2>Paramètres OVH</h2>
          <p>Configurez l'accès aux services OVH et lancez la synchronisation.</p>
        </div>
      </div>
      <div className="card">
        <div className="form-grid">
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
        </div>
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
            className="button-ghost"
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
            className={syncStatus === 'error' ? 'button-danger' : ''}
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
        <div className="status-stack">
          <p>Dernière sync: {formatSyncTime(settings.last_sync_at)}</p>
          <p>Erreurs récentes: {settings.last_error || '—'}</p>
        </div>
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

export default App
