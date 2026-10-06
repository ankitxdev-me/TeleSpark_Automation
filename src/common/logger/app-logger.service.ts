import { Injectable, LoggerService, Scope } from '@nestjs/common';
import * as winston from 'winston';

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  taskId?: string;
  jobId?: string;
  attemptId?: string;
  accountId?: string;
  leaseId?: string;
  operation?: string;
  [key: string]: any;
}

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private contextName: string = 'App';
  private defaultContext: LogContext = {};
  private winstonLogger: winston.Logger;

  constructor() {
    this.winstonLogger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston.format.printf(({ level, message, timestamp, context, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
              return `[${timestamp}] [${level.toUpperCase()}] [${context || 'App'}] ${message}${metaStr}`;
            }),
          ),
        }),
      ],
    });
  }

  setContext(context: string) {
    this.contextName = context;
  }

  setDefaultContext(ctx: LogContext) {
    this.defaultContext = { ...this.defaultContext, ...ctx };
  }

  log(message: string, context?: LogContext | string) {
    const merged = typeof context === 'string' 
      ? { context: context || this.contextName, ...this.defaultContext } 
      : { context: this.contextName, ...this.defaultContext, ...context };
    this.winstonLogger.info(message, merged);
  }

  error(message: string, trace?: string, context?: LogContext | string) {
    const meta = typeof context === 'string'
      ? { context: context || this.contextName, trace, ...this.defaultContext }
      : { context: this.contextName, trace, ...this.defaultContext, ...context };
    this.winstonLogger.error(message, meta);
  }

  warn(message: string, context?: LogContext | string) {
    const merged = typeof context === 'string'
      ? { context: context || this.contextName, ...this.defaultContext }
      : { context: this.contextName, ...this.defaultContext, ...context };
    this.winstonLogger.warn(message, merged);
  }

  debug(message: string, context?: LogContext | string) {
    const merged = typeof context === 'string'
      ? { context: context || this.contextName, ...this.defaultContext }
      : { context: this.contextName, ...this.defaultContext, ...context };
    this.winstonLogger.debug(message, merged);
  }

  verbose(message: string, context?: LogContext | string) {
    const merged = typeof context === 'string'
      ? { context: context || this.contextName, ...this.defaultContext }
      : { context: this.contextName, ...this.defaultContext, ...context };
    this.winstonLogger.verbose(message, merged);
  }
}
