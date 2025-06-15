
// --- ABSOLUTE MINIMAL DIAGNOSTIC SEED SCRIPT V3 ---
// Goal: See if *any* console output from ts-node appears when run via `prisma db seed`.

console.log('--- LOG FROM seed.ts (V3) ---');
console.info('--- INFO FROM seed.ts (V3) ---');
console.warn('--- WARN FROM seed.ts (V3) ---');
console.error('--- ERROR FROM seed.ts (V3) ---');

// Prisma CLI expects the seed script to exit.
// Forcing a successful exit.
// In Node.js, if the event loop is empty (no more async operations pending),
// the process will exit naturally. A simple script like this will do so.
// We can add an explicit process.exit(0) to be absolutely sure.

// If the script reaches here, it means console logging should have occurred.
// If process.exit is available, use it. Otherwise, the script will end.
if (typeof process !== 'undefined' && typeof process.exit === 'function') {
    console.log('--- SEED.TS (V3): Attempting process.exit(0) ---');
    process.exit(0);
} else {
    console.error('--- SEED.TS (V3): process.exit is not available. Script will end naturally. ---');
}
