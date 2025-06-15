
import crypto from 'crypto';

const algorithm = 'aes-256-cbc';
let ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;
const DEFAULT_DEV_KEY_HEX = "000102030405060708090a0b0c0d0e0f000102030405060708090a0b0c0d0e0f";

if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
  if (process.env.NODE_ENV === 'production') {
    console.error('CRITICAL: ENCRYPTION_KEY environment variable is not set or is not a 64-character hex string in a production environment.');
    throw new Error('CRITICAL: ENCRYPTION_KEY environment variable is not set or is not a 64-character hex string in a production environment.');
  }
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

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) {
        throw new Error('Invalid encrypted text format (missing IV prefix).');
    }
    const ivFromTextString = textParts.shift();
    if (!ivFromTextString) {
        throw new Error('IV string part is undefined after split.');
    }
    const ivFromText = Buffer.from(ivFromTextString, 'hex');
    const encryptedTextString = textParts.join(':');
    const encryptedText = Buffer.from(encryptedTextString, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, ivFromText);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    let detail = "Unknown error during decryption.";
    if (error instanceof Error) detail = error.message;
    throw new Error(`Decryption failed. Data might be corrupted or key mismatch. Detail: ${detail}`);
  }
}
