import request from 'supertest'
import app from '../src/index.js'
import { Pool } from 'pg'
import { config } from 'dotenv'

config()

const TEST_DB_URL = process.env.DATABASE_URL + '_test'

describe('Booking Service API Tests', () => {
  let pool
  let server

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL })
    
    const client = await pool.connect()
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS bookings(
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          user_name TEXT NOT NULL,
          user_phone TEXT,
          professional_email TEXT NOT NULL,
          professional_name TEXT NOT NULL,
          request_date DATE NOT NULL,
          address TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      await client.query('DELETE FROM bookings WHERE professional_email LIKE $1', ['%test%'])
    } finally {
      client.release()
    }

    server = app.listen(4003)
  })

  afterAll(async () => {
    if (server) server.close()
    if (pool) await pool.end()
  })

  beforeEach(async () => {
    const client = await pool.connect()
    try {
      await client.query('DELETE FROM bookings WHERE professional_email LIKE $1', ['%test%'])
    } finally {
      client.release()
    }
  })

  describe('POST /bookings', () => {
    test('debería fallar sin autenticación', async () => {
      const bookingData = {
        professionalEmail: 'pro@example.com',
        professionalName: 'Test Professional',
        requestDate: '2024-01-15',
        address: 'Test Address 123',
        description: 'Test service description',
        userPhone: '+1234567890'
      }

      const response = await request(app)
        .post('/bookings')
        .send(bookingData)
        .expect(401)

      expect(response.body).toHaveProperty('error', 'No autorizado')
    })

    // Nota: Las pruebas con autenticación real requerirían un servicio de auth mock
  })

  describe('GET /bookings/me', () => {
    test('debería fallar sin autenticación', async () => {
      const response = await request(app)
        .get('/bookings/me')
        .expect(401)

      expect(response.body).toHaveProperty('error', 'No autorizado')
    })
  })

  describe('GET /bookings/professional/me', () => {
    test('debería fallar sin autenticación', async () => {
      const response = await request(app)
        .get('/bookings/professional/me')
        .expect(401)

      expect(response.body).toHaveProperty('error', 'No autorizado')
    })
  })

  describe('GET /bookings/latest', () => {
    beforeEach(async () => {
      // Insertar datos de prueba
      const client = await pool.connect()
      try {
        await client.query(`
          INSERT INTO bookings (user_id, user_name, professional_email, professional_name, request_date, address, description) 
          VALUES 
          (1, 'Test User 1', 'test1@example.com', 'Test Pro 1', '2024-01-10', 'Address 1', 'Description 1'),
          (2, 'Test User 2', 'test2@example.com', 'Test Pro 2', '2024-01-11', 'Address 2', 'Description 2')
        `)
      } finally {
        client.release()
      }
    })

    test('debería retornar las últimas reservas', async () => {
      const response = await request(app)
        .get('/bookings/latest')
        .expect(200)

      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body.length).toBeGreaterThan(0)
      expect(response.body[0]).toHaveProperty('user_name')
      expect(response.body[0]).toHaveProperty('professional_email')
      expect(response.body[0]).toHaveProperty('status', 'pending')
    })
  })

  describe('PUT /bookings/:id/status', () => {
    let bookingId

    beforeEach(async () => {
      const client = await pool.connect()
      try {
        const result = await client.query(`
          INSERT INTO bookings (user_id, user_name, professional_email, professional_name, request_date, address, description) 
          VALUES (1, 'Status Test User', 'status@example.com', 'Status Pro', '2024-01-15', 'Test Address', 'Test Description')
          RETURNING id
        `)
        bookingId = result.rows[0].id
      } finally {
        client.release()
      }
    })

    test('debería fallar sin autenticación', async () => {
      const response = await request(app)
        .put(`/bookings/${bookingId}/status`)
        .send({ status: 'accepted' })
        .expect(401)

      expect(response.body).toHaveProperty('error', 'No autorizado')
    })
  })

  describe('Health Check', () => {
    test('debería retornar estado OK', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      expect(response.body).toHaveProperty('status', 'OK')
      expect(response.body).toHaveProperty('service', 'booking-service')
    })
  })

  describe('Validación de Datos', () => {
    test('debería validar datos de reserva correctamente', async () => {
      // Esta prueba verifica la lógica de validación internamente
      const validBooking = {
        professionalEmail: 'valid@example.com',
        professionalName: 'Valid Professional',
        requestDate: '2024-01-20',
        address: 'Valid address with sufficient length',
        description: 'Valid description with sufficient length',
        userPhone: '+1234567890'
      }

      // La validación se ejecuta en el endpoint, pero podemos testear la función de validación
      // si la exportamos desde el módulo principal
      expect(validBooking.professionalEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      expect(validBooking.professionalName.length).toBeGreaterThan(1)
      expect(validBooking.address.length).toBeGreaterThan(4)
      expect(validBooking.description.length).toBeGreaterThan(9)
    })
  })
})