import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import LoginPage from './auth/LoginPage'
import AuthenticatedWorkspace from './auth/AuthenticatedWorkspace'
import ThemeProvider from './theme/ThemeProvider'
import './App.css'
import './projects.css'
import './settings.css'
import './auth.css'

function AuthGate() {
  const { user, loading, configError } = useAuth()
  if (loading)
    return (
      <main className="auth-screen">
        <p role="status">Checking your session…</p>
      </main>
    )
  if (configError || !user) return <LoginPage />
  // Reset all navigation and pending request state when accounts change.
  return <AuthenticatedWorkspace key={user.id} />
}

export default function App({ client, configError }) {
  return (
    <ThemeProvider>
      <AuthProvider client={client} configError={configError}>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  )
}
