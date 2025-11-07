import request from 'supertest'
import app from '../src/index.js'
import { Pool } from 'pg'
import { config } from 'dotenv'

config()

const TEST_DB_URL = process.env.DATABASE_URL + '_test'

describe('Auth Service API Tests', () => {
  let pool
  let server

  beforeAll(async () => {
    // Configurar base de datos de prueba
    pool = new Pool({ connectionString: TEST_DB_URL })
    
    // Crear tablas de prueba
    const client = await pool.connect()
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users(
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT 'Usuario',
          role TEXT NOT NULL DEFAULT 'contractor',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP,
          login_attempts INT DEFAULT 0,
          is_locked BOOLEAN DEFAULT false
        )
      `)
      await client.query('DELETE FROM users WHERE email LIKE $1', ['%test%'])
    } finally {
      client.release()
    }

    server = app.listen(4001)
  })

  afterAll(async () => {
    if (server) server.close()
    if (pool) await pool.end()
  })

  beforeEach(async () => {
    // Limpiar usuarios de prueba antes de cada test
    const client = await pool.connect()
    try {
      await client.query('DELETE FROM users WHERE email LIKE $1', ['%test%'])
    } finally {
      client.release()
    }
  })

  describe('POST /register', () => {
    test('debería registrar un nuevo usuario exitosamente', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
        role: 'contractor'
      }

      const response = await request(app)
        .post('/register')
        .send(userData)
        .expect(201)

      expect(response.body).toHaveProperty('message', 'Usuario registrado exitosamente')
      expect(response.body.user).toHaveProperty('email', userData.email)
      expect(response.body.user).toHaveProperty('name', userData.name)
      expect(response.body.user).toHaveProperty('role', userData.role)
    })

    test('debería fallar al registrar con email inválido', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'Password123!',
        name: 'Test User'
      }

      const response = await request(app)
        .post('/register')
        .send(userData)
        .expect(400)

      expect(response.body).toHaveProperty('error', 'Email inválido')
    })

    test('debería fallar al registrar con contraseña corta', async () => {
      const userData = {
        email: 'test2@example.com',
        password: '123',
        name: 'Test User'
      }

      const response = await request(app)
        .post('/register')
        .send(userData)
        .expect(400)

      expect(response.body).toHaveProperty('error', 'La contraseña debe tener al menos 6 caracteres')
    })

    test('debería fallar al registrar email duplicado', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'Password123!',
        name: 'Test User'
      }

      // Primer registro
      await request(app).post('/register').send(userData).expect(201)

      // Segundo registro con mismo email
      const response = await request(app)
        .post('/register')
        .send(userData)
        .expect(409)

      expect(response.body).toHaveProperty('error', 'El email ya está registrado')
    })
  })

  describe('POST /login', () => {
    beforeEach(async () => {
      // Crear usuario de prueba
      const userData = {
        email: 'login@example.com',
        password: 'Password123!',
        name: 'Login Test User'
      }
      await request(app).post('/register').send(userData)
    })

    test('debería iniciar sesión exitosamente con credenciales válidas', async () => {
      const credentials = {
        email: 'login@example.com',
        password: 'Password123!'
      }

      const response = await request(app)
        .post('/login')
        .send(credentials)
        .expect(200)

      expect(response.body).toHaveProperty('token')
      expect(response.body).toHaveProperty('user')
      expect(response.body.user).toHaveProperty('email', credentials.email)
      expect(response.body).toHaveProperty('expiresIn', '24h')
    })

    test('debería fallar con credenciales incorrectas', async () => {
      const credentials = {
        email: 'login@example.com',
        password: 'WrongPassword!'
      }

      const response = await request(app)
        .post('/login')
        .send(credentials)
        .expect(401)

      expect(response.body).toHaveProperty('error', 'Credenciales inválidas')
    })

    test('debería bloquear la cuenta después de múltiples intentos fallidos', async () => {
      const credentials = {
        email: 'login@example.com',
        password: 'WrongPassword!'
      }

      // Intentos fallidos
      for (let i = 0; i < 5; i++) {
        await request(app).post('/login').send(credentials).expect(401)
      }

      // Sexto intento - cuenta bloqueada
      const response = await request(app)
        .post('/login')
        .send(credentials)
        .expect(423)

      expect(response.body).toHaveProperty('error', 'Cuenta temporalmente bloqueada')
    })
  })

  describe('GET /me', () => {
    let authToken

    beforeEach(async () => {
      // Crear usuario y obtener token
      const userData = {
        email: 'me@example.com',
        password: 'Password123!',
        name: 'Me Test User'
      }
      await request(app).post('/register').send(userData)

      const loginResponse = await request(app)
        .post('/login')
        .send({ email: 'me@example.com', password: 'Password123!' })

      authToken = loginResponse.body.token
    })

    test('debería obtener el perfil del usuario con token válido', async () => {
      const response = await request(app)
        .get('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('email', 'me@example.com')
      expect(response.body).toHaveProperty('name', 'Me Test User')
      expect(response.body).not.toHaveProperty('password_hash')
    })

    test('debería fallar sin token de autorización', async () => {
      const response = await request(app)
        .get('/me')
        .expect(401)

      expect(response.body).toHaveProperty('error', 'Token de acceso requerido')
    })

    test('debería fallar con token inválido', async () => {
      const response = await request(app)
        .get('/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403)

      expect(response.body).toHaveProperty('error', 'Token inválido')
    })
  })

  describe('POST /verify', () => {
    let authToken

    beforeEach(async () => {
      const userData = {
        email: 'verify@example.com',
        password: 'Password123!',
        name: 'Verify Test User'
      }
      await request(app).post('/register').send(userData)

      const loginResponse = await request(app)
        .post('/login')
        .send({ email: 'verify@example.com', password: 'Password123!' })

      authToken = loginResponse.body.token
    })

    test('debería verificar un token válido', async () => {
      const response = await request(app)
        .post('/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('valid', true)
      expect(response.body).toHaveProperty('user')
      expect(response.body.user).toHaveProperty('email', 'verify@example.com')
    })
  })

  describe('Health Check', () => {
    test('debería retornar estado OK', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)

      expect(response.body).toHaveProperty('status', 'OK')
      expect(response.body).toHaveProperty('service', 'auth-service')
    })
  })
})