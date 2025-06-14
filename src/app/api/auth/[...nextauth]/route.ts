
import crypto from 'crypto';

const algorithm = 'aes-256-cbc';

// Attempt to load ENCRYPTION_KEY from environment variables
let ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;

// Define default insecure key for development fallback
const DEFAULT_DEV_KEY_HEX = "000102030405060708090a0b0c0d0e0f000102030405060708090a0b0c0d0e0f"; // 32-byte

// Check ENCRYPTION_KEY
if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) { // 32 bytes = 64 hex chars
  if (process.env.NODE_ENV === 'production') {
    // In production, missing or invalid key is a critical error
    throw new Error('CRITICAL: ENCRYPTION_KEY environment variable is not set or is not a 64-character hex string in a production environment.');
  }
  // In development, use default and warn
  console.warn(
    '\n⚠️ WARNING: ENCRYPTION_KEY environment variable is not set or is invalid.\n' +
    'Using a default, insecure key for development purposes ONLY.\n' +
    'DO NOT USE THIS IN PRODUCTION.\n' +
    'Please set a secure 64-character hexadecimal string for ENCRYPTION_KEY in your .env file.\n' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n'
  );
  ENCRYPTION_KEY_HEX = DEFAULT_DEV_KEY_HEX;
}

const key = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
// The ENCRYPTION_IV environment variable is no longer used for the iv buffer here.
// A new IV is generated for each encryption.

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16); // Generate a fresh, random IV for each encryption
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted; // Prepend the IV used for this encryption
}

export function decrypt(text: string): string {
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) {
        throw new Error('Invalid encrypted text format (missing IV prefix).');
    }
    const ivFromText = Buffer.from(textParts.shift()!, 'hex'); // Extract the IV prepended during encryption
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, ivFromText); // Use the global key and the extracted IV
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption failed:', error);
    let detail = "Unknown error during decryption.";
    if (error instanceof Error) detail = error.message;
    // It's crucial to throw a new error to signal failure, rather than returning potentially incorrect data.
    throw new Error(`Decryption failed. Data might be corrupted or key mismatch. Detail: ${detail}`);
  }
}

interface User {
  username: string;
  passwordHash: string;
  contactPhone?: string;
}
const users: User[] = []; // This mock user store is not used by the loginAction
export function createUser(username: string, password: string, contactPhone?: string): void {
  const passwordHash = encrypt(password);
  const encryptedContactPhone = contactPhone ? encrypt(contactPhone) : undefined;
  users.push({ username, passwordHash, contactPhone: encryptedContactPhone });
}
export function authenticateUser(username: string, passwordAttempt: string): boolean {
  const user = users.find(u => u.username === username);
  if (!user) {
    return false;
  }
  try {
    const decryptedPassword = decrypt(user.passwordHash);
    return decryptedPassword === passwordAttempt;
  } catch (e) {
    console.error("Authentication decryption failed for user:", username, e);
    return false;
  }
}
export function getUserContactPhone(username: string): string | undefined {
  const user = users.find(u => u.username === username);
  if (user && user.contactPhone) {
    try {
      return decrypt(user.contactPhone);
    } catch (e) {
      console.error("Contact phone decryption failed for user:", username, e);
      return undefined;
    }
  }
  return undefined;
}
