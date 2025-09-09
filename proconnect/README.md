# ProConnect — Plataforma de servicios profesionales

Plataforma que conecta **usuarios** con **profesionales** para reservar citas y gestionar servicios. Arquitectura con **microservicios**, empaquetada en **contenedores Docker**, y orquestación con **Kubernetes**. Incluye **patrones de diseño** aplicados y una **arquitectura de la información** clara.

## Cómo correr en local (Docker Compose)
1. Instala Docker y Docker Compose.
2. Crea un archivo `.env` en la raíz (puedes copiar `.env.example`).
3. Ejecuta:
```bash
docker compose up --build
```
4. Frontend local: http://localhost:5173  
   API Gateway: http://localhost:8080

## Servicios (microservicios)
- **auth-service (4001):** registro, login, JWT, perfil.
- **professionals-service (4002):** catálogo de servicios y profesionales.
- **booking-service (4003):** reservas, disponibilidad, notificaciones simuladas.
- **gateway (8080):** API Gateway (proxy) para exponer `/api/*` al frontend.
- **postgres (5432):** Base de datos con **tres** BD separadas (una por servicio) para respetar *database-per-service* (dev en una sola instancia).

## Endpoints principales (a través del gateway)
- POST `/api/auth/register` — Crea usuario
- POST `/api/auth/login` — Retorna JWT
- GET  `/api/auth/me` — Perfil (requiere `Authorization: Bearer <token>`)
- GET  `/api/pro/services` — Lista de servicios
- GET  `/api/pro/professionals` — Lista de profesionales
- POST `/api/bookings` — Crea una reserva
- GET  `/api/bookings/me` — Lista reservas del usuario autenticado

## Arquitectura de la Información (AI) — Dónde está en la app
- **Estructura y organización (jerarquías, taxonomías):** `webapp/index.html` (secciones *Inicio, Servicios, Profesionales, Perfil, Mis Citas*).  
- **Navegación:** `webapp/index.html` (barra superior y SPA mínima con enrutamiento por hash).  
- **Rotulación:** etiquetas claras y consistentes en botones y menús (por ejemplo “Iniciar sesión”, “Reservar”).  
- **Contexto:** paneles y mensajes que se actualizan según el estado del usuario (secciones condicionales, mensajes tras login y reservas).

## Patrones de diseño — Dónde se aplican
- **Repository pattern:** acceso a datos en `services/*/src/repositories/*Repository.js`.
- **Factory Method:** creación del cliente de BD en `services/*/src/db/dbFactory.js`.
- **Strategy:** `booking-service` usa estrategias de notificación en `src/patterns/strategy/NotificationStrategy.js`.
- **Observer (Event Emitter):** eventos de nueva reserva en `booking-service/src/patterns/observer/EventBus.js` con suscriptores de notificación.

## Contenedores (Docker) — Dónde está en el repo
- `Dockerfile` en **cada servicio** y en `webapp/`.
- `docker-compose.yml` en la raíz: define **multicontenedor**, redes y dependencias.
- Volúmenes para persistencia y scripts de inicialización de BD en `db/init/`.

## Kubernetes (K8s) — Dónde está en el repo
- Manifiestos en `k8s/`: `*-deploy.yaml` (Deployments + Services) y `ingress.yaml`.
- **Ingress** enruta tráfico HTTP hacia el **gateway**. Ajusta el `host` a tu dominio o /etc/hosts.

## Flujo de una reserva
1. Usuario inicia sesión → obtiene **JWT**.
2. Usuario navega a **Profesionales**, elige uno, fecha/hora → **POST** `/api/bookings`.
3. `booking-service` valida disponibilidad, guarda y emite **evento** (Observer).  
4. Notificador aplica **Strategy** (por ahora, `ConsoleNotifier` simulado).

## Credenciales de ejemplo (seed dev)
- Usuario demo: `demo@proconnect.local` / `demo1234` (se crea al iniciar `auth-service`).

---

### Estructura de carpetas
```
proconnect/
├─ docker-compose.yml
├─ .env.example
├─ README.md
├─ gateway/
├─ webapp/
├─ services/
│  ├─ auth/
│  ├─ professionals/
│  └─ booking/
├─ db/
│  └─ init/
└─ k8s/
```

> **Nota:** Los manifiestos de K8s usan imágenes `your-registry/...`. Sube tus imágenes a un registro y actualiza los `image:`.
