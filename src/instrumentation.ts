
import fs from 'fs';
import path from 'path';
import util from 'util';

// This function is called once when the server starts.
export async function register() {
  // Use process.stdout.write for initial logs before console might be wrapped
  process.stdout.write("Attempting to register instrumentation hook...\n");

  if (process.env.NODE_ENV === 'development' && process.env.NEXT_RUNTIME === 'nodejs') {
    process.stdout.write(`[Instrumentation] Development mode detected (NODE_ENV: ${process.env.NODE_ENV}, NEXT_RUNTIME: ${process.env.NEXT_RUNTIME}). Initializing backend file logging.\n`);

    const projectRoot = process.cwd();
    const logDir = path.join(projectRoot, '.logs');
    const logFile = path.join(logDir, 'backend.log');

    // Preserve original console methods *before* any potential errors in setup
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    };

    try {
      originalConsole.log('[Instrumentation] Inside try block. Attempting to create log directory and file.');
      originalConsole.log(`[Instrumentation] Project root: ${projectRoot}`);
      originalConsole.log(`[Instrumentation] Log directory target: ${logDir}`);
      originalConsole.log(`[Instrumentation] Log file target: ${logFile}`);

      if (!fs.existsSync(logDir)) {
        originalConsole.log(`[Instrumentation] Log directory ${logDir} does not exist. Creating...`);
        fs.mkdirSync(logDir, { recursive: true });
        originalConsole.log(`[Instrumentation] Log directory ${logDir} created successfully.`);
      } else {
        originalConsole.log(`[Instrumentation] Log directory ${logDir} already exists.`);
      }

      const logStream = fs.createWriteStream(logFile, { flags: 'a' });
      originalConsole.log(`[Instrumentation] Log stream created for ${logFile}.`);

      const writeLogToFile = (level: string, ...args: any[]) => {
        try {
          const timestamp = new Date().toISOString();
          const message = util.format(...args);
          logStream.write(`[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
        } catch (e: any) { 
          originalConsole.error('[Instrumentation] Error writing to backend log file:', e.message, e.stack);
        }
      };

      console.log = (...args: any[]) => {
        writeLogToFile('log', ...args);
        originalConsole.log.apply(console, args);
      };

      console.error = (...args: any[]) => {
        writeLogToFile('error', ...args);
        originalConsole.error.apply(console, args);
      };

      console.warn = (...args: any[]) => {
        writeLogToFile('warn', ...args);
        originalConsole.warn.apply(console, args);
      };

      console.info = (...args: any[]) => {
        writeLogToFile('info', ...args);
        originalConsole.info.apply(console, args);
      };

      console.debug = (...args: any[]) => {
        writeLogToFile('debug', ...args);
        originalConsole.debug.apply(console, args);
      };

      originalConsole.log('[Instrumentation] Backend file logging initialized. Console methods have been wrapped. Logs will be written to .logs/backend.log');

      const cleanup = (signal: string) => {
        originalConsole.log(`[Instrumentation] Received ${signal}. Closing backend log stream...`);
        if (logStream && !logStream.closed) {
            logStream.end(() => {
               originalConsole.log('[Instrumentation] Backend log stream closed.');
            });
        } else {
            originalConsole.log('[Instrumentation] Log stream already closed or not initialized.');
        }
      };
      
      process.on('exit', (code) => {
        originalConsole.log(`[Instrumentation] Process exiting with code ${code}. Ensuring log stream is closed.`);
        if (logStream && !logStream.closed) {
            logStream.end();
            originalConsole.log('[Instrumentation] Log stream closed on exit.');
        }
      });
      process.on('SIGINT', () => cleanup('SIGINT')); 
      process.on('SIGTERM', () => cleanup('SIGTERM'));
      process.on('uncaughtException', (error) => {
        originalConsole.error('[Instrumentation] Uncaught Exception:', error.message, error.stack);
      });
      process.on('unhandledRejection', (reason, promise) => {
        originalConsole.error('[Instrumentation] Unhandled Rejection at:', promise, 'reason:', reason);
      });

    } catch (error: any) { 
      originalConsole.error('[Instrumentation] CRITICAL FAILURE during file logging setup:', error.message, error.stack);
    }
  } else {
    process.stdout.write(`[Instrumentation] Conditions not met for file logging (NODE_ENV: ${process.env.NODE_ENV}, NEXT_RUNTIME: ${process.env.NEXT_RUNTIME}). File logging SKIPPED.\n`);
  }
}
