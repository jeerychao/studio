import crypto from 'crypto';

const algorithm = 'aes-256-cbc';
const key = crypto.randomBytes(32); // Generate a random key (store this securely!)
const iv = crypto.randomBytes(16);  // Generate a random initialization vector

export function encrypt(text: string): string {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Example usage in an authentication handler (simplified)

interface User {
  username: string;
  passwordHash: string; // Store encrypted password hash
  contactPhone?: string; // Store encrypted phone number
}

const users: User[] = []; // In-memory user storage (replace with database)

// When creating a user
export function createUser(username: string, password: string, contactPhone?: string): void {
  const passwordHash = encrypt(password); // Encrypt password hash
  const encryptedContactPhone = contactPhone ? encrypt(contactPhone) : undefined; // Encrypt phone number
  users.push({ username, passwordHash, contactPhone: encryptedContactPhone });
}

// When authenticating a user
export function authenticateUser(username: string, passwordAttempt: string): boolean {
  const user = users.find(u => u.username === username);
  if (!user) {
    return false; // User not found
  }

  const decryptedPasswordHash = decrypt(user.passwordHash); // Decrypt stored password hash
  // In a real application, you would compare a hash of passwordAttempt
  // with decryptedPasswordHash, not the raw password.
  // For demonstration, comparing decrypted values:
  return decryptedPasswordHash === passwordAttempt;
}

// To retrieve sensitive information (requires decryption)
export function getUserContactPhone(username: string): string | undefined {
  const user = users.find(u => u.username === username);
  if (user && user.contactPhone) {
    return decrypt(user.contactPhone);
  }
  return undefined;
}