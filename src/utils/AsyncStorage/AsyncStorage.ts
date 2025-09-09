import { isBase64 } from "@utils/isBase64";
import { ACCESS_CONTROL, AuthenticationPrompt } from "react-native-keychain";

// Helper to encode/decode
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Convert between binary and Base64
const arrayBufferToBase64 = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

const base64ToArrayBuffer = (base64: string) =>
  Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;

// eslint-disable-next-line @typescript-eslint/require-await
const getItem = async (
  key: string,
  _prompt?: AuthenticationPrompt,
  encryptionKey?: string
) => {
  const value = localStorage.getItem(key)?.toString();

  if (encryptionKey && value && isBase64(value)) {
    try {
      const data = new Uint8Array(base64ToArrayBuffer(value));
      const salt = data.slice(0, 16);
      const iv = data.slice(16, 28);
      const ciphertext = data.slice(28);

      const keyMaterial = await getKeyMaterial(encryptionKey);
      const key = await deriveKey(keyMaterial, salt);

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );

      return textDecoder.decode(decrypted);
    } catch (e) {
      throw new Error("Cannot decrypt data");
    }
  } else {
    return value;
  }
};

const setItem = async (
  key: string,
  value: string,
  _accessControl?: ACCESS_CONTROL,
  encryptionKey?: string
) => {
  if (encryptionKey) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await getKeyMaterial(encryptionKey);
    const derivedKey = await deriveKey(keyMaterial, salt);

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      derivedKey,
      textEncoder.encode(value)
    );

    // Combine salt + iv + encrypted
    const combined = new Uint8Array(
      salt.length + iv.length + encrypted.byteLength
    );
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return localStorage.setItem(key, arrayBufferToBase64(combined.buffer));
  } else {
    return localStorage.setItem(key, value);
  }
};

// eslint-disable-next-line @typescript-eslint/require-await
const removeItem = async (key: string) => {
  return localStorage.removeItem(key);
};

// eslint-disable-next-line @typescript-eslint/require-await
const clear = async () => {
  return localStorage.clear();
};

/** Derive a cryptographic key from the password */
const getKeyMaterial = async (password: string) => {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
};

const deriveKey = async (keyMaterial: CryptoKey, salt: BufferSource) => {
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
};

const AsyncStorage = { getItem, setItem, removeItem, clear };

export { AsyncStorage };
