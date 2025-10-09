import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

export interface ServiceConfig {
  name: string;
  url: string;
  routes: string[];
}

export interface GatewayRequest extends Request {
  service?: string;
  startTime?: number;
}

// Tipos para http-proxy-middleware
export interface ProxyOptions {
  target: string;
  changeOrigin?: boolean;
  pathRewrite?: { [key: string]: string } | ((path: string) => string);
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}