import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  changePassword,
  createUser,
  debugSync,
  exportCallsCsv,
  fetchCalls,
  fetchDashboardSummary,
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
  users: 'Utilisateurs',
  settings: 'Paramètres OVH',
  debug: 'Debug synchro',
  changePassword: 'Changer mot de passe'
}

const wsUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws`
}

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
        if (me.must_change_password) {
          setPage('changePassword')
        }
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
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin')
  return (
    <div className="login">
      <h2>Connexion</h2>
      <label>
        Nom d'utilisateur
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label>
        Mot de passe
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button onClick={() => onLogin(username, password)}>Se connecter</button>
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
  const [summary, setSummary] = useState<{
    today_total: number
    today_missed: number
    week_total: number
    week_missed: number
  } | null>(null)
  const [timeseries, setTimeseries] = useState<
    { date: string; total: number; missed: number }[]
  >([])
  const [latestCalls, setLatestCalls] = useState<any[]>([])
  const [ovhStatus, setOvhStatus] = useState<{
    last_sync_at?: string | null
    last_error?: string | null
  } | null>(null)

  const reload = async () => {
    const [summaryData, timeseriesData, callsData, ovhData] = await Promise.all([
      fetchDashboardSummary(token),
      fetchDashboardTimeseries(token),
      fetchCalls(token, { page: 1, page_size: 5 }),
      isAdmin ? fetchOvhSettings(token) : Promise.resolve(null)
    ])
    setSummary(summaryData)
    setTimeseries(timeseriesData)
    setLatestCalls(callsData)
    setOvhStatus(ovhData)
  }

  useEffect(() => {
    reload()
    const ws = new WebSocket(wsUrl())
    ws.onmessage = () => reload()
    return () => ws.close()
  }, [])

  if (!summary) return <div>Chargement...</div>

  return (
    <div>
      <h2>Dashboard</h2>
      <div className="kpi-grid">
        <Kpi label="📞 Appels aujourd'hui" value={summary.today_total} />
        <Kpi label="🚨 Manqués aujourd'hui" value={summary.today_missed} />
        <Kpi label="📆 Appels 7 jours" value={summary.week_total} />
        <Kpi label="😓 Manqués 7 jours" value={summary.week_missed} />
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
        <h3>Appels par jour</h3>
        <div className="timeseries">
          {timeseries.map((point) => (
            <div key={point.date} className="timeseries-item">
              <span>{point.date}</span>
              <strong>{point.total}</strong>
              <small>Manqués: {point.missed}</small>
            </div>
          ))}
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
            </tr>
          </thead>
          <tbody>
            {latestCalls.map((call) => (
              <tr key={call.id}>
                <td>{new Date(call.started_at).toLocaleString()}</td>
                <td>{formatDirection(call.direction)}</td>
                <td>{call.calling_number}</td>
                <td>{call.called_number}</td>
                <td>{call.duration}s</td>
                <td>{formatCallStatus(call)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

const Kpi = ({ label, value }: { label: string; value: number }) => (
  <div className="kpi">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
)

const formatDirection = (direction: string) =>
  direction === 'OUTBOUND' ? '📤 Sortant' : '📥 Entrant'

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
    return () => ws.close()
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
          </tr>
        </thead>
        <tbody>
          {calls.map((call) => (
            <tr key={call.id}>
              <td>{new Date(call.started_at).toLocaleString()}</td>
              <td>{formatDirection(call.direction)}</td>
              <td>{call.calling_number}</td>
              <td>{call.called_number}</td>
              <td>{call.duration}s</td>
              <td>{formatCallStatus(call)}</td>
              <td>{call.is_missed ? 'Oui' : 'Non'}</td>
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
  const [settings, setSettings] = useState<any>(null)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [testLogs, setTestLogs] = useState<string[]>([])
  const [syncStatus, setSyncStatus] = useState<'idle' | 'pending' | 'error'>('idle')

  const formatSyncTime = (value?: string | null) => {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString()
  }

  const load = async () => {
    const data = await fetchOvhSettings(token)
    setSettings(data)
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

  if (!settings) return <div>Chargement...</div>

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
