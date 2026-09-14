import cryptoForge from 'node-forge'
import crypto from 'crypto';
import { GANAA_STREAM_KEY } from './constant.js';

const GAANA_BLOCK_SIZE = 16;

export function decryptGaanaLink(encryptedData) {
    try {
        if (!encryptedData || typeof encryptedData !== 'string') return '';

        const payload = encryptedData.trim();
        const key = Buffer.from(GANAA_STREAM_KEY, 'utf8');

        const offset = parseInt(payload[0], 10);
        if (isNaN(offset)) return '';

        const iv = Buffer.from(payload.slice(offset, offset + GAANA_BLOCK_SIZE), 'utf8');
        if (iv.length !== GAANA_BLOCK_SIZE) return '';

        const cipherBytes = Buffer.from(payload.slice(offset + GAANA_BLOCK_SIZE), 'base64');

        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        decipher.setAutoPadding(false);
        let decrypted = Buffer.concat([decipher.update(cipherBytes), decipher.final()]);

        // Older responses use PKCS#7 padding; current responses may not.
        const paddingLength = decrypted[decrypted.length - 1];
        if (paddingLength >= 1 && paddingLength <= GAANA_BLOCK_SIZE) {
            const padding = Buffer.alloc(paddingLength, paddingLength);
            if (decrypted.subarray(decrypted.length - paddingLength).equals(padding)) {
                decrypted = decrypted.subarray(0, decrypted.length - paddingLength);
            }
        }

        return decrypted.toString('utf8');
    } catch (error) {
        return '';
    }
}

/**
 * Generates a cryptographically secure random 256-bit token
 * @returns {string} A 64-character hexadecimal string representing the 256-bit token
 */
export function generate256BitToken() {
    const randomBytes = crypto.randomBytes(32);
    return randomBytes.toString('hex');
}

export function createDownloadLinks(encryptedMediaUrl) {
    if (!encryptedMediaUrl) return [];

    const qualities = [
        { id: '_12', bitrate: '12kbps' },
        { id: '_48', bitrate: '48kbps' },
        { id: '_96', bitrate: '96kbps' },
        { id: '_160', bitrate: '160kbps' },
        { id: '_320', bitrate: '320kbps' }
    ];

    const key = '38346591';
    const iv = '00000000';

    const encrypted = cryptoForge.util.decode64(encryptedMediaUrl);
    const decipher = cryptoForge.cipher.createDecipher('DES-ECB', cryptoForge.util.createBuffer(key));
    decipher.start({ iv: cryptoForge.util.createBuffer(iv) });
    decipher.update(cryptoForge.util.createBuffer(encrypted));
    decipher.finish();

    const decryptedLink = decipher.output.getBytes();

    return qualities.map((quality) => ({
        quality: quality.bitrate,
        url: decryptedLink.replace('_96', quality.id)
    }));
}