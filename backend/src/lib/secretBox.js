import crypto from 'crypto';
import { getJwtSecret } from './jwt.js';

function key() {
  return crypto.createHash('sha256').update(`${getJwtSecret()}:chaoxing-box`).digest();
}

/** AES-256-GCM；返回 base64(iv|tag|cipher) */
export function sealSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function openSecret(packed) {
  const buf = Buffer.from(String(packed || ''), 'base64');
  if (buf.length < 29) throw new Error('凭证损坏');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
