const API_BASE = ''

const headers = (token?: string) => {
  const result: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    result.Authorization = `Bearer ${token}`
  }
  return result
}

const resolveErrorMessage = async (response: Response, fallback: string) => {
  const clone = response.clone()
  const payload = await response.json().catch(() => null)
  const detail = payload?.detail
  const message =
    detail?.message || detail || payload?.message || payload?.error || payload?.errors
  if (message) return String(message)
  const text = await clone.text().catch(() => '')
  return text || fallback
}

export const login = async (username: string, password: string) => {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ username, password })
  })
  if (!response.ok) throw new Error('Login failed')
  return response.json()
}

export const fetchMe = async (token: string) => {
  const response = await fetch(`${API_BASE}/me`, { headers: headers(token) })
  if (!response.ok) throw new Error('Unauthorized')
  return response.json()
}

export const changePassword = async (
  token: string,
  current_password: string,
  new_password: string
) => {
  const response = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ current_password, new_password })
  })
  if (!response.ok) throw new Error('Change failed')
  return response.json()
}

export const fetchCalls = async (token: string, filters: Record<string, any>) => {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== undefined) {
      params.set(key, String(value))
    }
  })
  const response = await fetch(`${API_BASE}/calls?${params.toString()}`, {
    headers: headers(token)
  })
  if (!response.ok) throw new Error('Calls failed')
  return response.json()
}

export const exportCallsCsv = async (token: string, filters: Record<string, any>) => {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== undefined) {
      params.set(key, String(value))
    }
  })
  params.set('export', 'csv')
  const response = await fetch(`${API_BASE}/calls?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!response.ok) throw new Error('Export failed')
  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'calls.csv'
  link.click()
  window.URL.revokeObjectURL(url)
}

export const fetchDashboardSummary = async (token: string) => {
  const response = await fetch(`${API_BASE}/dashboard/summary`, {
    headers: headers(token)
  })
  if (!response.ok) throw new Error('Summary failed')
  return response.json()
}

export const fetchDashboardTimeseries = async (token: string) => {
  const response = await fetch(`${API_BASE}/dashboard/timeseries`, {
    headers: headers(token)
  })
  if (!response.ok) throw new Error('Timeseries failed')
  return response.json()
}

export const fetchDashboardHourly = async (token: string) => {
  const response = await fetch(`${API_BASE}/dashboard/hourly`, {
    headers: headers(token)
  })
  if (!response.ok) throw new Error('Hourly failed')
  return response.json()
}

export const fetchUsers = async (token: string) => {
  const response = await fetch(`${API_BASE}/users`, { headers: headers(token) })
  if (!response.ok) throw new Error('Users failed')
  return response.json()
}

export const createUser = async (token: string, payload: any) => {
  const response = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('User create failed')
  return response.json()
}

export const updateUser = async (token: string, userId: number, payload: any) => {
  const response = await fetch(`${API_BASE}/users/${userId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error('User update failed')
  return response.json()
}

export const fetchOvhSettings = async (token: string) => {
  const response = await fetch(`${API_BASE}/settings/ovh`, { headers: headers(token) })
  if (!response.ok) {
    const message = await resolveErrorMessage(
      response,
      'Impossible de charger les paramètres OVH.'
    )
    throw new Error(message)
  }
  return response.json()
}

export const saveOvhSettings = async (token: string, payload: any) => {
  const response = await fetch(`${API_BASE}/settings/ovh`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(payload)
  })
  if (!response.ok) {
    const message = await resolveErrorMessage(
      response,
      "Impossible d'enregistrer les paramètres OVH."
    )
    throw new Error(message)
  }
  return response.json()
}

export const testOvhSettings = async (token: string) => {
  const response = await fetch(`${API_BASE}/settings/ovh/test`, {
    method: 'POST',
    headers: headers(token)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload?.detail
    const message = detail?.message || detail || payload?.message || 'Échec du test OVH.'
    const logs = detail?.logs || payload?.logs || []
    const error = new Error(message)
    ;(error as Error & { logs?: string[] }).logs = logs
    throw error
  }
  return payload
}

export const triggerSync = async (token: string) => {
  const response = await fetch(`${API_BASE}/sync`, {
    method: 'POST',
    headers: headers(token)
  })
  if (!response.ok) throw new Error('Sync failed')
  return response.json()
}

export const debugSync = async (
  token: string,
  params: { days?: number; mode?: 'dry_run' | 'force_sync' }
) => {
  const search = new URLSearchParams()
  if (params.days) {
    search.set('days', String(params.days))
  }
  if (params.mode) {
    search.set('mode', params.mode)
  }
  const response = await fetch(`${API_BASE}/sync/debug?${search.toString()}`, {
    method: 'POST',
    headers: headers(token)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload?.detail
    const message = detail?.message || detail || 'Debug failed'
    const logs = detail?.logs || payload?.logs || []
    const error = new Error(message)
    ;(error as Error & { logs?: string[] }).logs = logs
    throw error
  }
  return payload
}
