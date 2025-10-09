import React, { useState, useEffect } from 'react'
import './app.css'

function App() {
  const [professionals, setProfessionals] = useState([])
  const [currentView, setCurrentView] = useState('home')

  // Cargar profesionales al iniciar
  useEffect(() => {
    fetchProfessionals()
  }, [])

  const fetchProfessionals = async () => {
    try {
      const response = await fetch('/professionals')
      const data = await response.json()
      setProfessionals(data)
    } catch (error) {
      console.error('Error cargando profesionales:', error)
    }
  }

  // Vista de Inicio
  const HomeView = () => (
    <div className="home">
      <h1>Bienvenido a PROCONNECT</h1>
      <p>Conectamos profesionales con clientes</p>
      
      <div className="buttons">
        <button onClick={() => setCurrentView('professionals')}>
          Ver Profesionales
        </button>
        <button onClick={() => setCurrentView('login')}>
          Iniciar Sesión
        </button>
      </div>
    </div>
  )

  // Vista de Profesionales
  const ProfessionalsView = () => (
    <div className="professionals">
      <h2>Nuestros Profesionales</h2>
      <button onClick={() => setCurrentView('home')}>← Volver</button>
      
      <div className="professionals-list">
        {professionals.map(pro => (
          <div key={pro.id} className="professional-card">
            <h3>{pro.name}</h3>
            <p>Especialidad: {pro.specialty}</p>
            <p>Experiencia: {pro.experience_years} años</p>
            <p>Precio: ${pro.hourly_rate}/hora</p>
            <button 
              onClick={() => alert(`Próximamente: reservar con ${pro.name}`)}
              className="btn-book"
            >
              Reservar
            </button>
          </div>
        ))}
      </div>
    </div>
  )

  // Vista de Login
  const LoginView = () => (
    <div className="login">
      <h2>Iniciar Sesión</h2>
      <button onClick={() => setCurrentView('home')}>← Volver</button>
      
      <form onSubmit={(e) => {
        e.preventDefault()
        alert('Funcionalidad de login próxima')
      }}>
        <input type="email" placeholder="Email" required />
        <input type="password" placeholder="Contraseña" required />
        <button type="submit">Entrar</button>
      </form>
      
      <p>
        ¿No tienes cuenta?{' '}
        <a href="#" onClick={() => alert('Registro próximo')}>
          Regístrate aquí
        </a>
      </p>
    </div>
  )

  // Renderizar vista actual
  const renderView = () => {
    switch(currentView) {
      case 'professionals':
        return <ProfessionalsView />
      case 'login':
        return <LoginView />
      default:
        return <HomeView />
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1 onClick={() => setCurrentView('home')} style={{cursor: 'pointer'}}>
          PROCONNECT
        </h1>
      </header>
      
      <main className="main">
        {renderView()}
      </main>
      
      <footer className="footer">
        <p>&copy; 2024 PROCONNECT. Todos los derechos reservados.</p>
      </footer>
    </div>
  )
}

export default App