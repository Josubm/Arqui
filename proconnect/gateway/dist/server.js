import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
// Load environment variables
dotenv.config();
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// Services configuration
const services = [
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
app.use((req, res, next) => {
    req.startTime = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'gateway'
    });
});
// Custom proxy middleware with error handling
const createServiceProxy = (service) => {
    const proxyOptions = {
        target: service.url,
        changeOrigin: true,
        pathRewrite: (path) => path,
        on: {
            // Usamos el sistema de eventos en lugar de onProxyReq directo
            proxyReq: (proxyReq, req, res) => {
                console.log(`Proxying ${req.method} ${req.url} to ${service.name} service`);
            },
            error: (err, req, res) => {
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
services.forEach((service) => {
    service.routes.forEach((route) => {
        app.use(route, createServiceProxy(service));
    });
});
// 404 handler for undefined routes
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
});
// Global error handler
app.use((err, req, res, next) => {
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
//# sourceMappingURL=server.js.map