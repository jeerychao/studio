
import crypto from 'crypto';
import { logger } from './logger'; // Using logger for more structured server-side logs

const algorithm = 'aes-256-cbc';
const DEFAULT_DEV_KEY_HEX = "000102030405060708090a0b0c0d0e0f000102030405060708090a0b0c0d0e0f";

function getEncryptionKey(): { keyHex: string; source: string } {
    const envKey = process.env.ENCRYPTION_KEY;
    const isKeyInvalid = !envKey || envKey.length !== 64;

    if (isKeyInvalid) {
        if (process.env.NODE_ENV === 'production') {
            const errorMessage = 'CRITICAL: ENCRYPTION_KEY environment variable is not set or is not a 64-character hex string in a production environment. Application will not start.';
            logger.error(errorMessage, undefined, { context: 'crypto-utils-init' });
            throw new Error(errorMessage);
        } else {
            logger.warn(
                'ENCRYPTION_KEY environment variable is not set or is invalid. ' +
                `Using a default, insecure key (DEFAULT_DEV_KEY_HEX) for development purposes ONLY. ` +
                'DO NOT USE THIS IN PRODUCTION. ' +
                'Please set a secure 64-character hexadecimal string for ENCRYPTION_KEY in your .env file. ' +
                'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
                undefined,
                { context: 'crypto-utils-init' }
            );
            return { keyHex: DEFAULT_DEV_KEY_HEX, source: "DEFAULT_DEV_KEY_HEX" };
        }
    } else {
        logger.info(
            `Using ENCRYPTION_KEY from environment. Starts with: ${envKey.substring(0, 4)}... Ends with: ...${envKey.substring(envKey.length - 4)} (Length: ${envKey.length})`,
            { context: 'crypto-utils-init' }
        );
        return { keyHex: envKey, source: "process.env.ENCRYPTION_KEY" };
    }
}

const { keyHex: ENCRYPTION_KEY_HEX, source: effectiveKeySource } = getEncryptionKey();

logger.info(
  `Effective encryption key source: ${effectiveKeySource}. Key used starts with: ${ENCRYPTION_KEY_HEX.substring(0,4)}...`,
  { context: 'crypto-utils-init' }
);

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
    // Log the specific key used for decryption attempt for better debugging
    // logger.error(
    //   `Decryption failed for input starting with: ${text.substring(0,20)}... Key used for decryption started with: ${key.toString('hex').substring(0,4)}...`,
    //   error,
    //   { context: 'crypto-utils-decrypt' }
    // );
    throw new Error(`Decryption failed. Data might be corrupted or key mismatch. Detail: ${detail}`);
  }
}
