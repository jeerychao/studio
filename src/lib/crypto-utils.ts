
import crypto from 'crypto';
import { logger } from './logger'; // Using logger for more structured server-side logs

const algorithm = 'aes-256-cbc';
const DEFAULT_DEV_KEY_HEX = "000102030405060708090a0b0c0d0e0f000102030405060708090a0b0c0d0e0f";

let keyHex: string;
let keySource: string;

const envKey = process.env.ENCRYPTION_KEY;

if (!envKey || envKey.length !== 64) {
    if (process.env.NODE_ENV === 'production') {
        const errorMessage = 'CRITICAL: ENCRYPTION_KEY environment variable is not set or is not a 64-character hex string in a production environment. Application will not start.';
        logger.error(errorMessage, undefined, { context: 'crypto-utils-init' });
        // This throw is intentional. It prevents the app from starting in a dangerously insecure state.
        throw new Error(errorMessage);
    } else {
        logger.warn(
            'ENCRYPTION_KEY environment variable is not set or is invalid. ' +
            `Using a default, insecure key for development purposes ONLY. ` +
            'DO NOT USE THIS IN PRODUCTION. ' +
            'Please set a secure 64-character hexadecimal string for ENCRYPTION_KEY in your .env file.',
            undefined,
            { context: 'crypto-utils-init' }
        );
        keyHex = DEFAULT_DEV_KEY_HEX;
        keySource = "DEFAULT_DEV_KEY_HEX";
    }
} else {
    keyHex = envKey;
    keySource = "process.env.ENCRYPTION_KEY";
}

logger.info(
  `Effective encryption key source: ${keySource}. Key used starts with: ${keyHex.substring(0,4)}...`,
  { context: 'crypto-utils-init' }
);

// The `key` is now guaranteed to be derived from a defined `keyHex`.
const key = Buffer.from(keyHex, 'hex');


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
