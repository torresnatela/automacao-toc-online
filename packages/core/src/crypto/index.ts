// Subpath `@toc/core/crypto`, isolado de propósito: importa `node:crypto`, que
// não existe no runtime Edge. Nunca importar daqui em middleware/proxy ou em
// Client Component — o padrão é o mesmo de `@toc/core/auth/guard`.
export {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  generateEncryptionKey,
  SecretCryptoError,
  type SecretCryptoErrorCode,
} from "./secret-box";
