import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { AppEnvironment } from '../config/env.validation';

export interface PersistedHandoffSecret {
  formatVersion: number;
  keyId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface EncryptedHandoffSecret extends PersistedHandoffSecret {
  formatVersion: 1;
}

export interface HandoffSecretContext {
  externalRecordId: string;
  fieldName: string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DECRYPTION_ERROR = 'Unable to decrypt protected handoff field';
const KEY_CONFIGURATION_ERROR =
  'HANDOFF_SECRET_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters';
const PREVIOUS_KEYS_CONFIGURATION_ERROR =
  'HANDOFF_SECRET_PREVIOUS_KEYS must contain comma-separated 32-byte keys encoded as 64 hexadecimal characters';

interface EncryptionKey {
  id: string;
  value: Buffer;
}

@Injectable()
export class HandoffSecretService {
  private readonly currentKey: EncryptionKey;
  private readonly decryptionKeys: Map<string, Buffer>;

  constructor(config: ConfigService<AppEnvironment, true>) {
    const encodedKey = config.getOrThrow<string>(
      'HANDOFF_SECRET_ENCRYPTION_KEY',
    );
    this.currentKey = decodeEncryptionKey(encodedKey, KEY_CONFIGURATION_ERROR);

    const previousKeys =
      config.get<string[]>('HANDOFF_SECRET_PREVIOUS_KEYS') ?? [];
    this.decryptionKeys = new Map([
      [this.currentKey.id, this.currentKey.value],
    ]);
    for (const previousKey of previousKeys) {
      const decoded = decodeEncryptionKey(
        previousKey,
        PREVIOUS_KEYS_CONFIGURATION_ERROR,
      );
      this.decryptionKeys.set(decoded.id, decoded.value);
    }
  }

  encrypt(
    context: HandoffSecretContext,
    value: string,
  ): EncryptedHandoffSecret | null {
    if (value.trim().length === 0) return null;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.currentKey.value, iv);
    cipher.setAAD(encodeContext(context));
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    return {
      formatVersion: 1,
      keyId: this.currentKey.id,
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(
    context: HandoffSecretContext,
    payload: PersistedHandoffSecret,
  ): string {
    try {
      if (payload.formatVersion !== 1) throw new Error(DECRYPTION_ERROR);
      const key = this.decryptionKeys.get(payload.keyId);
      if (!key) throw new Error(DECRYPTION_ERROR);

      const ciphertext = decodeCanonicalBase64(payload.ciphertext);
      const iv = decodeCanonicalBase64(payload.iv);
      const authTag = decodeCanonicalBase64(payload.authTag);
      if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error(DECRYPTION_ERROR);
      }

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAAD(encodeContext(context));
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error(DECRYPTION_ERROR);
    }
  }
}

function decodeEncryptionKey(
  value: string,
  errorMessage: string,
): EncryptionKey {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(errorMessage);

  const decoded = Buffer.from(value, 'hex');
  if (decoded.length !== 32) throw new Error(errorMessage);

  return {
    id: createHash('sha256').update(decoded).digest('hex'),
    value: decoded,
  };
}

function encodeContext(context: HandoffSecretContext): Buffer {
  return Buffer.from(
    JSON.stringify([context.externalRecordId, context.fieldName]),
    'utf8',
  );
}

function decodeCanonicalBase64(value: string): Buffer {
  if (typeof value !== 'string') throw new Error(DECRYPTION_ERROR);

  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error(DECRYPTION_ERROR);
  }
  return decoded;
}
