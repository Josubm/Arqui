import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { getDb } from './db/dbFactory.js'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'

config()

const app = express()

// Middlewares de seguridad
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true
}))
app.use(express.json({ limit: '25mb' }))

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Demasiadas solicitudes' },
  standardHeaders: true,
})
app.use(apiLimiter)

const pool = getDb(process.env.DATABASE_URL)

// Validación de datos
function validateProfessional(data) {
  const { name, service_id, email, bio } = data
  const errors = []
  
  if (!name || name.trim().length < 2) {
    errors.push('El nombre debe tener al menos 2 caracteres')
  }
  
  if (!service_id || isNaN(service_id)) {
    errors.push('ID de servicio inválido')
  }
  
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Email inválido')
  }
  
  if (bio && bio.length > 500) {
    errors.push('La biografía no puede exceder 500 caracteres')
  }
  
  return errors
}

async function init() {
  const c = await pool.connect()
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS services(
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS professionals(
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        service_id INT REFERENCES services(id),
        bio TEXT,
        email TEXT UNIQUE,
        photo_url TEXT,
        verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS slots(
        id SERIAL PRIMARY KEY,
        professional_id INT REFERENCES professionals(id),
        slot_ts TIMESTAMP NOT NULL,
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(professional_id, slot_ts)
      );
    `)

    // Asegurar columnas
    await c.query(`
      ALTER TABLE professionals ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
      ALTER TABLE professionals ADD COLUMN IF NOT EXISTS photo_url TEXT;
      ALTER TABLE professionals ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE professionals ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE professionals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `)

    // Catálogo de servicios
    const required = [
      'ingeniero', 'matemático', 'profesor', 'odontólogo', 
      'psicólogo', 'enfermero', 'abogado', 'Técnico electricista'
    ]
    
    const existing = await c.query('SELECT name FROM services')
    const have = new Set(existing.rows.map(r => r.name))
    
    for (const name of required) {
      if (!have.has(name)) {
        await c.query('INSERT INTO services(name) VALUES ($1)', [name])
      }
    }
  } finally {
    c.release()
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'professionals-service',
    timestamp: new Date().toISOString()
  })
})

// Obtener servicios
app.get('/services', async (req, res) => {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT * FROM services ORDER BY id')
    res.json(result.rows)
  } catch (error) {
    console.error('Error obteniendo servicios:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  } finally {
    client.release()
  }
})

// Obtener profesionales con filtros seguros
app.get('/professionals', async (req, res) => {
  const { serviceId, verification, sort = 'name' } = req.query
  
  // Validar parámetros
  if (serviceId && isNaN(parseInt(serviceId))) {
    return res.status(400).json({ error: 'ID de servicio inválido' })
  }
  
  const client = await pool.connect()
  try {
    let sql = `
      SELECT p.*, s.name as service_name 
      FROM professionals p 
      LEFT JOIN services s ON p.service_id = s.id 
      WHERE p.email IS NOT NULL
    `
    const params = []
    let paramCount = 0

    // Filtro por servicio
    if (serviceId) {
      paramCount++
      sql += ` AND p.service_id = $${paramCount}`
      params.push(parseInt(serviceId))
    }

    // Filtro por verificación
    if (verification === 'verified') {
      sql += ' AND p.verified = true'
    } else if (verification === 'unverified') {
      sql += ' AND p.verified = false'
    }

    // Ordenamiento seguro
    const allowedSorts = ['name', 'name_desc', 'verified', 'created_at']
    if (allowedSorts.includes(sort)) {
      if (sort === 'name_desc') {
        sql += ' ORDER BY p.name DESC'
      } else if (sort === 'verified') {
        sql += ' ORDER BY p.verified DESC, p.name ASC'
      } else if (sort === 'created_at') {
        sql += ' ORDER BY p.created_at DESC'
      } else {
        sql += ' ORDER BY p.name ASC'
      }
    } else {
      sql += ' ORDER BY p.name ASC'
    }

    const result = await client.query(sql, params)
    res.json(result.rows)
  } catch (error) {
    console.error('Error obteniendo profesionales:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  } finally {
    client.release()
  }
})

// Crear profesional
app.post('/professionals', async (req, res) => {
  const { name, service_id, bio, email, photo_url, verified } = req.body || {}
  
  const validationErrors = validateProfessional({ name, service_id, email, bio })
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: validationErrors.join(', ') })
  }

  const client = await pool.connect()
  try {
    const result = await client.query(
      `INSERT INTO professionals(name, service_id, bio, email, photo_url, verified) 
       VALUES($1, $2, $3, $4, $5, COALESCE($6, false)) 
       ON CONFLICT(email) DO UPDATE SET 
         name=EXCLUDED.name, 
         service_id=EXCLUDED.service_id, 
         bio=EXCLUDED.bio, 
         photo_url=EXCLUDED.photo_url, 
         verified=EXCLUDED.verified,
         updated_at=CURRENT_TIMESTAMP 
       RETURNING *`,
      [name.trim(), parseInt(service_id), bio || null, email || null, photo_url || null, verified === true]
    )
    
    res.status(201).json(result.rows[0])
  } catch (error) {
    console.error('Error creando profesional:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  } finally {
    client.release()
  }
})

// Obtener profesional por email
app.get('/professionals/by-email', async (req, res) => {
  const { email } = req.query
  
  if (!email) {
    return res.status(400).json({ error: 'Email requerido' })
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' })
  }

  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT * FROM professionals WHERE email = $1',
      [email.toLowerCase()]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profesional no encontrado' })
    }
    
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error obteniendo profesional:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  } finally {
    client.release()
  }
})

// Obtener profesional por ID
app.get('/professionals/:id', async (req, res) => {
  const { id } = req.params
  
  if (isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  const client = await pool.connect()
  try {
    const result = await client.query(
      `SELECT p.*, s.name as service_name 
       FROM professionals p 
       LEFT JOIN services s ON p.service_id = s.id 
       WHERE p.id = $1`,
      [parseInt(id)]
    )
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profesional no encontrado' })
    }
    
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error obteniendo profesional:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  } finally {
    client.release()
  }
})

// Actualizar profesional por email
app.put('/professionals/by-email', async (req, res) => {
  const { email, name, service_id, bio, photo_url, verified } = req.body || {}
  
  if (!email) {
    return res.status(400).json({ error: 'Email requerido' })
  }

  const client = await pool.connect()
  try {
    let sql = `
      UPDATE professionals 
      SET name = COALESCE($1, name), 
          service_id = COALESCE($2, service_id), 
          bio = COALESCE($3, bio), 
          photo_url = COALESCE($4, photo_url),
          updated_at = CURRENT_TIMESTAMP
    `
    const params = [name || null, service_id || null, bio || null, photo_url || null]
    
    if (typeof verified === 'boolean') { 
      sql += ', verified = $5'
      params.push(verified) 
    }
    
    const emailIndex = params.length + 1
    sql += ` WHERE email = $${emailIndex} RETURNING *`
    params.push(email.toLowerCase())
    
    const result = await client.query(sql, params)
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profesional no encontrado' })
    }
    
    res.json(result.rows[0])
  } catch (error) {
    console.error('Error actualizando profesional:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  } finally {
    client.release()
  }
})

const PORT = process.env.PORT || 4002
app.listen(PORT, async () => {
  await init()
  console.log(`👨‍💼 Professionals service ejecutándose en puerto ${PORT}`)
})

export default app
