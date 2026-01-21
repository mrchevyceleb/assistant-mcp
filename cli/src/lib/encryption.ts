import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getSupabase, getEncryptionKey } from './db.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

export function encrypt(text: string): string {
  const encryptionKey = getEncryptionKey();
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(encryptionKey, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // Combine salt + iv + tag + encrypted data
  const combined = Buffer.concat([
    salt,
    iv,
    tag,
    Buffer.from(encrypted, 'hex'),
  ]);

  return combined.toString('base64');
}

export function decrypt(encryptedData: string): string {
  const encryptionKey = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');

  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = deriveKey(encryptionKey, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Database operations for credentials
export async function storeCredential(
  service: string,
  apiKey: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();
  const encryptedKey = encrypt(apiKey);

  const { error } = await supabase
    .from('credentials')
    .upsert(
      {
        service,
        api_key_encrypted: encryptedKey,
        metadata: metadata || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'service' }
    );

  if (error) {
    throw new Error(`Failed to store credential: ${error.message}`);
  }
}

export async function getCredential(service: string): Promise<string> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('credentials')
    .select('api_key_encrypted')
    .eq('service', service)
    .single();

  if (error || !data) {
    throw new Error(`Credential not found for service: ${service}`);
  }

  return decrypt(data.api_key_encrypted);
}

export async function listCredentials(): Promise<Array<{ service: string; metadata: Record<string, unknown>; created_at: string; updated_at: string }>> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('credentials')
    .select('service, metadata, created_at, updated_at')
    .order('service');

  if (error) {
    throw new Error(`Failed to list credentials: ${error.message}`);
  }

  return data || [];
}

export async function deleteCredential(service: string): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('credentials')
    .delete()
    .eq('service', service);

  if (error) {
    throw new Error(`Failed to delete credential: ${error.message}`);
  }
}
