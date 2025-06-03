
export async function register() {
  // This is the most basic log. If this doesn't appear in the terminal
  // when running `npm run dev`, Next.js is not running this file.
  const originalConsoleLog = console.log; // Preserve original console.log early
  originalConsoleLog('--- INSTRUMENTATION.TS REGISTER FUNCTION CALLED ---');

  if (process.env.NODE_ENV === 'development' && process.env.NEXT_RUNTIME === 'nodejs') {
    originalConsoleLog('[Instrumentation DEV] Starting file logging setup...');
    let logStream: any = null; // Define logStream outside try to be accessible in cleanup
    const originalConsole = { // Store all original console methods
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug,
    };

    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const util = await import('node:util');

      const projectRoot = process.cwd();
      const logDir = path.join(projectRoot, '.logs');
      const logFile = path.join(logDir, 'backend.log');

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
        originalConsole.log(`[Instrumentation DEV] Created log directory: ${logDir}`);
      } else {
        originalConsole.log(`[Instrumentation DEV] Log directory ${logDir} already exists.`);
      }

      logStream = fs.createWriteStream(logFile, { flags: 'a' });
      originalConsole.log(`[Instrumentation DEV] Log stream opened for ${logFile}`);


      const writeLogToFile = (level: string, ...args: any[]) => {
        if (!logStream || logStream.destroyed) {
            originalConsole.error('[Instrumentation DEV] Log stream is not available or destroyed. Cannot write to file.');
            return;
        }
        try {
          const timestamp = new Date().toISOString();
          // Sanitize args for util.format, especially if they might be complex objects
          const safeArgs = args.map(arg => {
            if (arg instanceof Error) return arg.stack || arg.message;
            // Basic check for circular structures - not exhaustive
            try {
              JSON.stringify(arg); // Test if serializable
              return arg;
            } catch (e) {
              return '[Unserializable Object]';
            }
          });
          const message = util.format(...safeArgs);
          logStream.write(`[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
        } catch (e: any) {
          originalConsole.error('[Instrumentation DEV] Error writing to backend log file:', e.message, e.stack);
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

      originalConsole.log('[Instrumentation DEV] Backend file logging initialized. Console methods wrapped.');

      const cleanup = (signal: string) => {
        originalConsole.log(`[Instrumentation DEV] Received ${signal}. Closing log stream.`);
        if (logStream && !logStream.destroyed && !logStream.closed) {
          logStream.end(() => {
            originalConsole.log('[Instrumentation DEV] Log stream closed.');
            // In some cases, especially with abrupt exits, process might terminate before callback.
            // For critical cleanup, consider synchronous operations if absolutely necessary,
            // but generally async end is preferred.
          });
        } else {
            originalConsole.log('[Instrumentation DEV] Log stream was already closed or not initialized during cleanup.');
        }
      };
      
      // Graceful shutdown
      process.on('exit', () => cleanup('exit')); // General exit
      process.on('SIGINT', () => { // Ctrl+C
        cleanup('SIGINT');
        process.exit(0); // Ensure process exits after cleanup
      }); 
      process.on('SIGTERM', () => { // Termination signal
        cleanup('SIGTERM');
        process.exit(0);
      });
      process.on('uncaughtException', (error, origin) => {
        originalConsole.error(`[Instrumentation DEV] Uncaught Exception at: ${origin}`, error);
        cleanup('uncaughtException');
        // It's often recommended to exit after an uncaught exception,
        // but be cautious as this can interrupt ongoing operations.
        // fs.writeSync(process.stderr.fd, `Uncaught Exception: ${error}\nOrigin: ${origin}`); // Try direct sync write for critical errors
        // process.exit(1); // Exit with error
      });
      process.on('unhandledRejection', (reason, promise) => {
        originalConsole.error('[Instrumentation DEV] Unhandled Rejection at:', promise, 'reason:', reason);
        // cleanup('unhandledRejection'); // Optional: cleanup on unhandled rejection
        // process.exit(1); // Optional: exit on unhandled rejection
      });


    } catch (error: any) {
      originalConsole.error('[Instrumentation DEV] CRITICAL FAILURE during file logging setup:', error.stack || error.message);
    }
  } else {
    originalConsoleLog(`[Instrumentation] Conditions not met for DEV file logging (NODE_ENV: ${process.env.NODE_ENV}, NEXT_RUNTIME: ${process.env.NEXT_RUNTIME}). File logging SKIPPED.`);
  }
}
