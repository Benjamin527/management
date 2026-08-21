import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppEnvironment } from '../config/env.validation';

export interface EncryptedHandoffSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DECRYPTION_ERROR = 'Unable to decrypt protected handoff field';
const KEY_CONFIGURATION_ERROR =
  'HANDOFF_SECRET_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters';

@Injectable()
export class HandoffSecretService {
  private readonly key: Buffer;

  constructor(config: ConfigService<AppEnvironment, true>) {
    const encodedKey = config.getOrThrow<string>(
      'HANDOFF_SECRET_ENCRYPTION_KEY',
    );
    if (!/^[a-f0-9]{64}$/i.test(encodedKey)) {
      throw new Error(KEY_CONFIGURATION_ERROR);
    }

    this.key = Buffer.from(encodedKey, 'hex');
    if (this.key.length !== 32) {
      throw new Error(KEY_CONFIGURATION_ERROR);
    }
  }

  encrypt(value: string): EncryptedHandoffSecret | null {
    if (value.trim().length === 0) return null;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(payload: EncryptedHandoffSecret): string {
    try {
      const ciphertext = decodeCanonicalBase64(payload.ciphertext);
      const iv = decodeCanonicalBase64(payload.iv);
      const authTag = decodeCanonicalBase64(payload.authTag);
      if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error(DECRYPTION_ERROR);
      }

      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
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

function decodeCanonicalBase64(value: string): Buffer {
  if (typeof value !== 'string') throw new Error(DECRYPTION_ERROR);

  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error(DECRYPTION_ERROR);
  }
  return decoded;
}
