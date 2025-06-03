
export async function register() {
  // This is the most basic log. If this doesn't appear in the terminal
  // when running `npm run dev`, Next.js is not running this file.
  console.log('--- INSTRUMENTATION.TS REGISTER FUNCTION CALLED ---');

  if (process.env.NODE_ENV === 'development' && process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation DEV] Starting file logging setup...');
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const util = await import('node:util');

      const projectRoot = process.cwd();
      const logDir = path.join(projectRoot, '.logs');
      const logFile = path.join(logDir, 'backend.log');

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
        console.log(`[Instrumentation DEV] Created log directory: ${logDir}`);
      }

      const logStream = fs.createWriteStream(logFile, { flags: 'a' });

      const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug,
      };

      const writeLogToFile = (level: string, ...args: any[]) => {
        try {
          const timestamp = new Date().toISOString();
          // Sanitize args for util.format, especially if they might be complex objects
          const safeArgs = args.map(arg => {
            if (arg instanceof Error) return arg.stack || arg.message;
            return arg;
          });
          const message = util.format(...safeArgs);
          logStream.write(`[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
        } catch (e: any) {
          originalConsole.error('[Instrumentation DEV] Error writing to backend log file:', e.message);
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

      console.log('[Instrumentation DEV] Backend file logging initialized. Console methods wrapped.');

      const cleanup = (signal: string) => {
        originalConsole.log(`[Instrumentation DEV] Received ${signal}. Closing log stream.`);
        if (logStream && !logStream.closed) {
          logStream.end(() => {
            originalConsole.log('[Instrumentation DEV] Log stream closed.');
          });
        }
      };
      process.on('exit', () => cleanup('exit'));
      process.on('SIGINT', () => cleanup('SIGINT'));
      process.on('SIGTERM', () => cleanup('SIGTERM'));

    } catch (error: any) {
      console.error('[Instrumentation DEV] CRITICAL FAILURE during file logging setup:', error.stack || error.message);
    }
  } else {
    console.log(`[Instrumentation] Conditions not met for DEV file logging (NODE_ENV: ${process.env.NODE_ENV}, NEXT_RUNTIME: ${process.env.NEXT_RUNTIME}). File logging SKIPPED.`);
  }
}
