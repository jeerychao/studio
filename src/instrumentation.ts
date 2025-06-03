
import fs from 'fs';
import path from 'path';
import util from 'util';

// This function is called once when the server starts.
export async function register() {
  // Only run this in development mode and for the Node.js runtime.
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_RUNTIME === 'nodejs') {
    const projectRoot = process.cwd();
    const logDir = path.join(projectRoot, '.logs');
    const logFile = path.join(logDir, 'backend.log');

    try {
      // Ensure .logs directory exists
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Create a writable stream to append to the log file
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
          // Use util.format to handle various argument types (objects, arrays, etc.)
          const message = util.format(...args);
          logStream.write(`[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
        } catch (e) {
          // If logging to file fails, log the error to the original console
          originalConsole.error('Error writing to backend log file:', e);
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

      originalConsole.log('Backend file logging initialized. Logs will be written to .logs/backend.log');

      // Graceful shutdown: Ensure log stream is closed when the process exits.
      const cleanup = () => {
        originalConsole.log('Closing backend log stream...');
        logStream.end(() => {
           originalConsole.log('Backend log stream closed.');
           process.exit(); // Ensure process exits after stream closes on signal
        });
      };
      
      process.on('exit', () => {
        // This might not always run for SIGINT/SIGTERM if they are not handled cleanly before exit
        if (logStream && !logStream.closed) {
            originalConsole.log('Process exiting, ensuring log stream is closed.');
            logStream.end();
        }
      });
      process.on('SIGINT', cleanup); // Catches Ctrl+C
      process.on('SIGTERM', cleanup); // Catches kill commands
      process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        // Optionally, ensure log stream flushes and closes before exiting
        // logStream.end(() => process.exit(1));
      });
      process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        // Optionally, ensure log stream flushes and closes before exiting
        // logStream.end(() => process.exit(1));
      });


    } catch (error) {
      console.error('Failed to initialize backend file logging:', error);
    }
  }
}
