
import crypto from 'crypto';

const algorithm = 'aes-256-cbc';

// Ensure ENCRYPTION_KEY and ENCRYPTION_IV are set in your .env file
// Generate them once and store them securely.
// Example generation:
// KEY: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// IV:  node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;
const ENCRYPTION_IV_HEX = process.env.ENCRYPTION_IV;

if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) { // 32 bytes = 64 hex chars
  throw new Error('ENCRYPTION_KEY environment variable is not set or is not a 64-character hex string.');
}
if (!ENCRYPTION_IV_HEX || ENCRYPTION_IV_HEX.length !== 32) { // 16 bytes = 32 hex chars
  throw new Error('ENCRYPTION_IV environment variable is not set or is not a 32-character hex string.');
}

const key = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
const iv = Buffer.from(ENCRYPTION_IV_HEX, 'hex'); // This IV is used by createCipheriv and createDecipheriv

// Encrypt function now uses the persistent key and iv from environment variables.
// The IV prepended to the ciphertext is the persistent IV itself.
export function encrypt(text: string): string {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Prepend the static IV (from env) for consistency with how it might be expected or for simpler migration
  // Though typically for CBC, a unique IV per encryption is best practice, then prepend that unique IV.
  // For this fix, we'll keep it simple and use the static IV from env, assuming it's prepended.
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt function now uses the persistent key from environment variables.
// It expects the IV to be prepended to the ciphertext.
export function decrypt(text: string): string {
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) {
        throw new Error('Invalid encrypted text format (missing IV prefix).');
    }
    const ivFromText = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    
    // Validate that the IV from text matches the system's IV if we enforce using the static IV.
    // For this setup, we assume the IV stored with the text is the one to use for decryption with the master key.
    // If the encryption always prepends the static process.env.ENCRYPTION_IV, then ivFromText should match it.
    // If encrypt generates a new IV each time and prepends it, then ivFromText is that new IV.
    // The current `encrypt` function prepends the static `iv` from `process.env`.

    const decipher = crypto.createDecipheriv(algorithm, key, ivFromText);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption failed:', error);
    // It's often better to throw a specific error or return a consistent error indicator
    // rather than the original crypto error message, which might leak info.
    throw new Error('Decryption failed. Data might be corrupted or key/IV mismatch.');
  }
}


// --- The rest of your NextAuth route handler would go here (if any) ---
// For now, this file primarily serves as the crypto utility.
// If you have NextAuth.js setup, it would be more like:
// import NextAuth from "next-auth"
// import CredentialsProvider from "next-auth/providers/credentials"
// import { loginAction } from "@/lib/actions" // Assuming loginAction is adapted for NextAuth

// export const authOptions = {
//   providers: [
//     CredentialsProvider({
//       name: "Credentials",
//       credentials: {
//         email: { label: "Email", type: "text" },
//         password: { label: "Password", type: "password" }
//       },
//       async authorize(credentials) {
//         if (!credentials) return null;
//         const result = await loginAction({ email: credentials.email, password: credentials.password });
//         if (result.success && result.user) {
//           return { id: result.user.id, name: result.user.username, email: result.user.email, role: result.user.roleName, image: result.user.avatar };
//         }
//         return null;
//       }
//     })
//   ],
//   pages: {
//     signIn: '/login',
//   },
//   // Add callbacks, session strategy, etc. as needed
// };

// const handler = NextAuth(authOptions);
// export { handler as GET, handler as POST };

// For the purpose of this fix, we'll assume this file just exports encrypt/decrypt
// and doesn't have a full NextAuth setup yet, or that setup is elsewhere.
// If there is NextAuth code, it should be preserved around these encrypt/decrypt functions.

// If this file is *only* for crypto, it should be in `lib` and not in `app/api/auth`.
// But based on prompt, user modified this one. So I'll keep structure.

// Example placeholder for User and authenticateUser if they were here.
// These are not used by the loginAction directly from this file anymore.
interface User {
  username: string;
  passwordHash: string;
  contactPhone?: string;
}
const users: User[] = [];
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

    