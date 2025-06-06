// src/lib/logger.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  error?: {
    name?: string;
    message?: string;
    stack?: string;
    code?: string; // For AppError code
    field?: string; // For ValidationError field
  };
  data?: any;
  actionContext?: string; // Optional context like 'createSubnetAction'
}

class Logger {
  private static instance: Logger;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatErrorForLog(error?: Error | unknown): LogEntry['error'] | undefined {
    if (!error) return undefined;
    if (error instanceof Error) {
      const errorObj: LogEntry['error'] = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
      if ('code' in error && typeof error.code === 'string') {
        errorObj.code = error.code;
      }
      if ('field' in error && typeof error.field === 'string') {
        errorObj.field = error.field;
      }
      return errorObj;
    }
    return { message: String(error) };
  }

  private log(level: LogLevel, message: string, error?: Error | unknown, data?: any, actionContext?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      error: this.formatErrorForLog(error),
      data,
      actionContext
    };

    // In a real Firebase environment, you'd use Firebase Functions logging or a dedicated logging service.
    // For Firebase Hosting with Server Components/Actions, console.log/error on the server side
    // should appear in Firebase Functions logs if deployed that way, or server logs.
    if (level === 'error') {
      console.error(JSON.stringify(entry, null, 2));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry, null, 2));
    } else {
      console.log(JSON.stringify(entry, null, 2));
    }

    // TODO: Add production logging integration (e.g., Sentry, Google Cloud Logging)
  }

  debug(message: string, data?: any, actionContext?: string) {
    this.log('debug', message, undefined, data, actionContext);
  }

  info(message: string, data?: any, actionContext?: string) {
    this.log('info', message, undefined, data, actionContext);
  }

  warn(message: string, error?: Error | unknown, data?: any, actionContext?: string) {
    this.log('warn', message, error, data, actionContext);
  }

  error(message: string, error?: Error | unknown, data?: any, actionContext?: string) {
    this.log('error', message, error, data, actionContext);
  }
}

export const logger = Logger.getInstance();
