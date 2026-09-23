import { EncryptedPayload } from '../types';

// Helper functions for ArrayBuffer <-> Base64
export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Format hex string with separator
export function formatHex(hex: string, groupSize: number = 4, separator: string = ' '): string {
  return hex.match(new RegExp(`.{1,${groupSize}}`, 'g'))?.join(separator) || hex;
}

/**
 * Generates an ECDH KeyPair (NIST P-256 curve)
 */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Export key as JSON Web Key (JWK)
 */
export async function exportKey(key: CryptoKey): Promise<JsonWebKey> {
  return await window.crypto.subtle.exportKey('jwk', key);
}

/**
 * Import public key from JWK
 */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

/**
 * Import private key from JWK
 */
export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Derives a 256-bit AES-GCM shared key using ECDH key agreement
 */
export async function deriveSharedSecretKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return await window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // derived key is not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a string message with AES-256-GCM using derived ECDH shared key
 */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKey: CryptoKey,
  senderPrivateKey: CryptoKey,
  senderPublicKeyJwk: JsonWebKey
): Promise<EncryptedPayload> {
  // Derive session shared key
  const sharedKey = await deriveSharedSecretKey(senderPrivateKey, recipientPublicKey);

  // 12-byte initialization vector for AES-GCM standard
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128, // 16-byte authentication tag
    },
    sharedKey,
    plaintextBytes
  );

  return {
    algorithm: 'ECDH-P256 + AES-GCM-256',
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    senderPublicKeyJwk: JSON.stringify(senderPublicKeyJwk),
    timestamp: Date.now(),
    ephemeralKeyId: Math.random().toString(36).substring(2, 10),
  };
}

/**
 * Decrypts a received encrypted payload using recipient's private key
 */
export async function decryptMessage(
  payload: EncryptedPayload,
  recipientPrivateKey: CryptoKey
): Promise<string> {
  const senderPublicKeyJwk = JSON.parse(payload.senderPublicKeyJwk) as JsonWebKey;
  const senderPublicKey = await importPublicKey(senderPublicKeyJwk);

  // Derive matching shared secret
  const sharedKey = await deriveSharedSecretKey(recipientPrivateKey, senderPublicKey);

  const iv = new Uint8Array(base64ToArrayBuffer(payload.iv));
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      tagLength: 128,
    },
    sharedKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Generates a short human-readable hex fingerprint for a public key
 */
export async function computeKeyFingerprint(keyJwk: JsonWebKey): Promise<string> {
  const keyString = `${keyJwk.crv}:${keyJwk.x}:${keyJwk.y}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(keyString);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  // Return formatted first 16 characters e.g. "8F2C-4B91-3E2A-770F"
  const slice = hex.substring(0, 16);
  return formatHex(slice, 4, '-');
}

/**
 * Signal-style 60-digit Safety Number calculation between two public keys
 */
export async function generateSafetyNumber(
  keyA: JsonWebKey,
  keyB: JsonWebKey
): Promise<{ groups: string[]; hex: string; fullNumber: string }> {
  // Deterministic sorting so both parties compute the exact same safety number
  const strA = `${keyA.crv || 'P-256'}:${keyA.x || ''}:${keyA.y || ''}`;
  const strB = `${keyB.crv || 'P-256'}:${keyB.x || ''}:${keyB.y || ''}`;
  const sorted = [strA, strB].sort();

  const combined = sorted.join('::');
  const encoder = new TextEncoder();
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(combined));
  const hashBytes = new Uint8Array(hashBuffer);

  // Hex representation
  const hex = Array.from(hashBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

  // 12 groups of 5 decimal digits (Signal format)
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    // Take 2 bytes and convert to 5-digit number
    const val = ((hashBytes[i * 2] << 8) | hashBytes[i * 2 + 1]) % 100000;
    groups.push(val.toString().padStart(5, '0'));
  }

  return {
    groups,
    hex,
    fullNumber: groups.join(' '),
  };
}
