import request from 'supertest'
import app from '../src/index.js'
import { Pool } from 'pg'
import { config } from 'dotenv'

config()

const TEST_DB_URL = process.env.DATABASE_URL + '_test'

describe('Professionals Service API Tests', () => {
  let pool
  let server

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL })
    
    const client = await pool.connect()
    try {
      // Crear tablas
      await client.query(`
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
      `)

      // Limpiar datos de prueba
      await client.query('DELETE FROM professionals WHERE email LIKE $1', ['%test%'])
      await client.query('DELETE FROM services WHERE name LIKE $1', ['%Test%'])

      // Insertar servicios de prueba
      await client.query(`
        INSERT INTO services (name) VALUES 
        ('Test Service 1'),
        ('Test Service 2')
        ON CONFLICT DO NOTHING
      `)
    } finally {
      client.release()
    }

    server = app.listen(4002)
  })

  afterAll(async () => {
    if (server) server.close()
    if (pool) await pool.end()
  })

  beforeEach(async () => {
    const client = await pool.connect()
    try {
      await client.query('DELETE FROM professionals WHERE email LIKE $1', ['%test%'])
    } finally {
      client.release()
    }
  })

  describe('GET /services', () => {
    test('debería retornar lista de servicios', async () => {
      const response = await request(app)
        .get('/services')
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBeGreaterThan(0)
      expect(response.body[0]).toHaveProperty('id')
      expect(response.body[0]).toHaveProperty('name')
    })
  })

  describe('GET /professionals', () => {
    beforeEach(async () => {
      // Crear profesionales de prueba
      const client = await pool.connect()
      try {
        await client.query(`
          INSERT INTO professionals (name, service_id, email, verified, bio) VALUES
          ('Test Professional 1', 1, 'test1@example.com', true, 'Experienced professional'),
          ('Test Professional 2', 2, 'test2@example.com', false, 'Junior professional')
        `)
      } finally {
        client.release()
      }
    })

    test('debería retornar lista de profesionales', async () => {
      const response = await request(app)
        .get('/professionals')
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBeGreaterThan(0)
      expect(response.body[0]).toHaveProperty('name')
      expect(response.body[0]).toHaveProperty('email')
    })

    test('debería filtrar profesionales por servicio', async () => {
      const response = await request(app)
        .get('/professionals?serviceId=1')
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      // Todos los profesionales deben tener service_id = 1
      response.body.forEach(prof => {
        expect(prof.service_id).toBe(1)
      })
    })

    test('debería filtrar profesionales verificados', async () => {
      const response = await request(app)
        .get('/professionals?verification=verified')
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      // Todos los profesionales deben estar verificados
      response.body.forEach(prof => {
        expect(prof.verified).toBe(true)
      })
    })

    test('debería ordenar profesionales por nombre descendente', async () => {
      const response = await request(app)
        .get('/professionals?sort=name_desc')
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      if (response.body.length > 1) {
        expect(response.body[0].name.localeCompare(response.body[1].name)).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('POST /professionals', () => {
    test('debería crear un nuevo profesional', async () => {
      const professionalData = {
        name: 'New Test Professional',
        service_id: 1,
        email: 'newprofessional@example.com',
        bio: 'Test bio description',
        verified: true
      }

      const response = await request(app)
        .post('/professionals')
        .send(professionalData)
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.name).toBe(professionalData.name)
      expect(response.body.email).toBe(professionalData.email)
      expect(response.body.bio).toBe(professionalData.bio)
      expect(response.body.verified).toBe(true)
    })

    test('debería fallar al crear profesional sin nombre', async () => {
      const professionalData = {
        service_id: 1,
        email: 'test@example.com'
      }

      const response = await request(app)
        .post('/professionals')
        .send(professionalData)
        .expect(400)

      expect(response.body).toHaveProperty('error')
    })

    test('debería actualizar profesional existente con mismo email', async () => {
      const professionalData = {
        name: 'Original Name',
        service_id: 1,
        email: 'update@example.com',
        bio: 'Original bio'
      }

      // Crear profesional
      await request(app).post('/professionals').send(professionalData)

      // Actualizar profesional
      const updatedData = {
        name: 'Updated Name',
        service_id: 2,
        email: 'update@example.com',
        bio: 'Updated bio'
      }

      const response = await request(app)
        .post('/professionals')
        .send(updatedData)
        .expect(201)

      expect(response.body.name).toBe('Updated Name')
      expect(response.body.service_id).toBe(2)
      expect(response.body.bio).toBe('Updated bio')
    })
  })

  describe('GET /professionals/:id', () => {
    let professionalId

    beforeEach(async () => {
      // Crear profesional de prueba
      const client = await pool.connect()
      try {
        const result = await client.query(`
          INSERT INTO professionals (name, service_id, email, bio) 
          VALUES ('Detail Test', 1, 'detail@example.com', 'Test bio')
          RETURNING id
        `)
        professionalId = result.rows[0].id
      } finally {
        client.release()
      }
    })

    test('debería retornar profesional por ID', async () => {
      const response = await request(app)
        .get(`/professionals/${professionalId}`)
        .expect(200)

      expect(response.body).toHaveProperty('id', professionalId)
      expect(response.body).toHaveProperty('name', 'Detail Test')
      expect(response.body).toHaveProperty('email', 'detail@example.com')
    })

    test('debería fallar con ID inválido', async () => {
      const response = await request(app)
        .get('/professionals/invalid-id')
        .expect(400)

      expect(response.body).toHaveProperty('error', 'ID inválido')
    })

    test('debería fallar con profesional no existente', async () => {
      const response = await request(app)
        .get('/professionals/999999')
        .expect(404)

      expect(response.body).toHaveProperty('error', 'Profesional no encontrado')
    })
  })

  describe('GET /professionals/by-email', () => {
    beforeEach(async () => {
      const client = await pool.connect()
      try {
        await client.query(`
          INSERT INTO professionals (name, service_id, email) 
          VALUES ('Email Test', 1, 'emailtest@example.com')
        `)
      } finally {
        client.release()
      }
    })

    test('debería retornar profesional por email', async () => {
      const response = await request(app)
        .get('/professionals/by-email?email=emailtest@example.com')
        .expect(200)

      expect(response.body).toHaveProperty('email', 'emailtest@example.com')
      expect(response.body).toHaveProperty('name', 'Email Test')
    })

    test('debería fallar sin email', async () => {
      const response = await request(app)
        .get('/professionals/by-email')
        .expect(400)

      expect(response.body).toHaveProperty('error', 'Email requerido')
    })

    test('debería fallar con email inválido', async () => {
      const response = await request(app)
        .get('/professionals/by-email?email=invalid-email')
        .expect(400)

      expect(response.body).toHaveProperty('error', 'Email inválido')
    })
  })

  describe('Health Check', () => {
    test('debería retornar estado OK', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      expect(response.body).toHaveProperty('status', 'OK')
      expect(response.body).toHaveProperty('service', 'professionals-service')
    })
  })
})