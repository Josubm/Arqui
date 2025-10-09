import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { ServiceConfig, GatewayRequest } from './types/express.js';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Services configuration
const services: ServiceConfig[] = [
  {
    name: 'auth',
    url: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    routes: ['/auth/*', '/users/*']
  },
  {
    name: 'booking',
    url: process.env.BOOKING_SERVICE_URL || 'http://localhost:3002',
    routes: ['/bookings/*', '/appointments/*']
  },
  {
    name: 'professionals',
    url: process.env.PROFESSIONALS_SERVICE_URL || 'http://localhost:3003',
    routes: ['/professionals/*', '/services/*']
  }
];

// Request logging middleware
app.use((req: GatewayRequest, res: Response, next: NextFunction) => {
  req.startTime = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'gateway'
  });
});

// Custom proxy middleware with error handling
const createServiceProxy = (service: ServiceConfig) => {
  const proxyOptions: Options = {
    target: service.url,
    changeOrigin: true,
    pathRewrite: (path: string) => path,
    on: {
      // Usamos el sistema de eventos en lugar de onProxyReq directo
      proxyReq: (proxyReq, req: Request, res: Response) => {
        console.log(`Proxying ${req.method} ${req.url} to ${service.name} service`);
      },
      error: (err: Error, req: Request, res: Response) => {
        console.error(`Proxy error for ${service.name}:`, err.message);
        res.status(503).json({
          error: `Service ${service.name} is temporarily unavailable`,
          timestamp: new Date().toISOString()
        });
      }
    }
  };

  return createProxyMiddleware(proxyOptions);
};

// Setup proxy for each service
services.forEach((service: ServiceConfig) => {
  service.routes.forEach((route: string) => {
    app.use(route, createServiceProxy(service));
  });
});

// 404 handler for undefined routes
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Gateway service running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🔗 Available services:');
  services.forEach(service => {
    console.log(`   - ${service.name}: ${service.url}`);
  });
});

export default app;