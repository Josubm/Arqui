import express from 'express'
import cors from 'cors'
import {Pool} from 'pg'
import {config} from 'dotenv'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import {getDb} from './db/dbFactory.js'

config()

const app = express()

// Middlewares de seguridad
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}))
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos por ventana
  message: { error: 'Demasiados intentos de autenticación, intenta más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/login', authLimiter)
app.use('/register', authLimiter)

const pool = getDb(process.env.DATABASE_URL)

// Validación de email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Validación de password
function isValidPassword(password) {
  return password && password.length >= 6
}

async function init() {
  const client = await pool.connect()
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS users(
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Usuario',
      role TEXT NOT NULL DEFAULT 'contractor',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP,
      login_attempts INT DEFAULT 0,
      is_locked BOOLEAN DEFAULT false
    );`)
    
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS login_attempts INT DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
    `)

    // Usuario demo con bcrypt
    const demoPass = await bcrypt.hash('Demo123!', 12)
    await client.query(`
      INSERT INTO users(email, password_hash, name, role) 
      VALUES($1, $2, $3, $4) 
      ON CONFLICT (email) DO NOTHING`,
      ['demo@proconnect.local', demoPass, 'Usuario Demo', 'contractor']
    )
  } finally {
    client.release()
  }
}

app.post('/register', async (req, res) => {
  const { email, password, name, role = 'contractor' } = req.body || {}
  
  // Validaciones
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Todos los campos son requeridos' })
  }
  
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Email inválido' })
  }
  
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' })
  }

  if (name.length < 2) {
    return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' })
  }

  const client = await pool.connect()
  try {
    // Verificar si el usuario ya existe
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'El email ya está registrado' })
    }

    // Hash seguro de contraseña
    const passwordHash = await bcrypt.hash(password, 12)
    
    const result = await client.query(
      'INSERT INTO users(email, password_hash, name, role) VALUES($1, $2, $3, $4) RETURNING id, email, name, role, created_at',
      [email.toLowerCase(), passwordHash, name.trim(), role]
    )
    
    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: result.rows[0]
    })
  } catch (error) {
    console.error('Error en registro:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  } finally {
    client.release()
  }
})

app.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' })
  }

  const client = await pool.connect()
  try {
    // Buscar usuario
    const result = await client.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    )
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }
    
    const user = result.rows[0]
    
    // Verificar si la cuenta está bloqueada
    if (user.is_locked) {
      return res.status(423).json({ error: 'Cuenta temporalmente bloqueada' })
    }
    
    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password_hash)
    
    if (!isPasswordValid) {
      // Incrementar intentos fallidos
      const newAttempts = user.login_attempts + 1
      const isLocked = newAttempts >= 5
      
      await client.query(
        'UPDATE users SET login_attempts = $1, is_locked = $2 WHERE id = $3',
        [newAttempts, isLocked, user.id]
      )
      
      return res.status(401).json({ 
        error: 'Credenciales inválidas',
        attempts_remaining: 5 - newAttempts
      })
    }
    
    // Login exitoso - resetear intentos y actualizar último login
    await client.query(
      'UPDATE users SET login_attempts = 0, is_locked = false, last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    )
    
    // Generar JWT
    const token = jwt.sign(
      { 
        sub: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role 
      },
      process.env.JWT_SECRET || 'fallback-secret-change-in-production',
      { 
        expiresIn: '24h',
        issuer: 'proconnect-auth',
        audience: 'proconnect-app'
      }
    )
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      expiresIn: '24h'
    })
  } catch (error) {
    console.error('Error en login:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  } finally {
    client.release()
  }
})

// Middleware de autenticación mejorado
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' })
  }

  try {
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'fallback-secret-change-in-production',
      { issuer: 'proconnect-auth', audience: 'proconnect-app' }
    )
    req.user = decoded
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' })
    }
    return res.status(403).json({ error: 'Token inválido' })
  }
}

app.get('/me', authenticateToken, async (req, res) => {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT id, email, name, role, created_at, last_login FROM users WHERE id = $1',
      [req.user.sub]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }
    
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error obteniendo usuario:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  } finally {
    client.release()
  }
})

// Endpoint para verificar token
app.post('/verify', authenticateToken, (req, res) => {
  res.json({ 
    valid: true, 
    user: req.user,
    expiresIn: 'Token válido'
  })
})

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'auth-service',
    timestamp: new Date().toISOString()
  })
})

const PORT = process.env.PORT || 4001
app.listen(PORT, async () => {
  await init()
  console.log(`🔐 Auth service ejecutándose en puerto ${PORT}`)
})

export default app
