// --- ABSOLUTE MINIMAL DIAGNOSTIC SEED SCRIPT V2 ---
console.log('--- PRISMA SEED SCRIPT (ABSOLUTE MINIMAL V2): Script execution started ---');

// Intentionally do nothing else for this diagnostic test.
// We are only checking if ts-node can even execute this console.log
// when called by `prisma db seed`.

// Forcing a successful exit so Prisma CLI doesn't hang or report failure due to no async completion.
// Prisma expects the seed script to exit.
// This needs to be robust to different environments where process might be undefined (though unlikely for Node.js)
try {
  if (typeof process !== 'undefined' && typeof process.exit === 'function') {
    console.log('--- PRISMA SEED SCRIPT (ABSOLUTE MINIMAL V2): Attempting process.exit(0) ---');
    process.exit(0);
  } else {
    console.error('--- PRISMA SEED SCRIPT (ABSOLUTE MINIMAL V2): process.exit is not available. Throwing error to signal completion. ---');
    // If process.exit is not available, throwing an error might be the only way
    // to signal to Prisma CLI that the script has 'finished' in some manner,
    // though it might interpret it as a failed seed. This is a last resort.
    throw new Error("Seed script completed but process.exit was not available.");
  }
} catch (e: any) {
  console.error('--- PRISMA SEED SCRIPT (ABSOLUTE MINIMAL V2): Error during process.exit or fallback ---', e.message);
  // If even process.exit fails or is unavailable and throws, we log it.
  // Exiting with a non-zero code if possible, or just letting it end.
  if (typeof process !== 'undefined' && typeof process.exit === 'function') {
    process.exit(1);
  }
}
