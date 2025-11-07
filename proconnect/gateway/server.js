import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { createProxyMiddleware } from 'http-proxy-middleware'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'

config()

const app = express()

// Middlewares de seguridad
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}))
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}))

app.use(express.json({ limit: '10mb' }))

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // límite por IP
  message: { error: 'Demasiadas solicitudes, intenta más tarde' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(globalLimiter)

// Rate limiting más estricto para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de autenticación' },
  standardHeaders: true,
})
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)

// Middleware de logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`)
  next()
})

// Health checks
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'gateway',
    timestamp: new Date().toISOString()
  })
})

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'gateway-api',
    timestamp: new Date().toISOString()
  })
})

// Proxy configuration con manejo de errores
const createProxy = (target, pathRewrite = {}) => createProxyMiddleware({
  target,
  changeOrigin: true,
  pathRewrite,
  onError: (err, req, res) => {
    console.error(`Proxy error for ${req.path}:`, err.message)
    res.status(503).json({ 
      error: 'Servicio temporalmente no disponible',
      service: target
    })
  },
  timeout: 10000,
})

// Routes
app.use('/api/auth', createProxy(process.env.AUTH_URL, { '^/api/auth': '' }))
app.use('/api/pro', createProxy(process.env.PRO_URL, { '^/api/pro': '' }))
app.use('/api/bookings', createProxy(process.env.BOOK_URL, { '^/api/bookings': '/bookings' }))

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Ruta no encontrada',
    path: req.originalUrl,
    method: req.method
  })
})

// Manejo global de errores
app.use((error, req, res, next) => {
  console.error('Error global:', error)
  res.status(500).json({ 
    error: 'Error interno del servidor',
    reference: req.id
  })
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log(`🚀 Gateway ejecutándose en puerto ${PORT}`)
  console.log(`📍 Orígenes permitidos: ${process.env.CORS_ORIGIN}`)
})

export default app
