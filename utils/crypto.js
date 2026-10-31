/**
 * VaporBooster - Encryption Utilities
 * Handles credential encryption/decryption
 * 
 * @author VaporBooster Team
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

class CryptoManager {
    constructor() {
        this.encryptionKey = null;
        this.loadKey();
    }

    /**
     * Load or generate encryption key
     */
    loadKey() {
        const keyPath = path.join(__dirname, '..', '.encryption-key');

        // Try environment variable first
        if (process.env.ENCRYPTION_KEY) {
            this.encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
            return;
        }

        // Try loading from file
        if (fs.existsSync(keyPath)) {
            try {
                const data = fs.readFileSync(keyPath, 'utf8');
                this.encryptionKey = Buffer.from(data.trim(), 'hex');
                return;
            } catch (err) {
                console.warn('Failed to load encryption key:', err.message);
            }
        }

        // Generate new key
        this.encryptionKey = crypto.randomBytes(KEY_LENGTH);

        // Save it (with restricted permissions)
        try {
            fs.writeFileSync(keyPath, this.encryptionKey.toString('hex'), {
                mode: 0o600
            });
        } catch (err) {
            console.error('Failed to save encryption key:', err.message);
        }
    }

    /**
     * Derive key from password using PBKDF2
     * @param {string} password 
     * @param {Buffer} salt 
     * @returns {Buffer}
     */
    deriveKey(password, salt) {
        return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
    }

    /**
     * Encrypt data
     * @param {string} plaintext 
     * @param {string} password - Optional additional password
     * @returns {string} Encrypted data as base64
     */
    encrypt(plaintext, password = null) {
        if (!plaintext) return plaintext;

        let key = this.encryptionKey;

        // Use password-derived key if provided
        if (password) {
            const salt = crypto.randomBytes(SALT_LENGTH);
            key = this.deriveKey(password, salt);
        }

        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const tag = cipher.getAuthTag();

        // Format: iv:tag:encrypted (or salt:iv:tag:encrypted if password used)
        if (password) {
            const salt = crypto.randomBytes(SALT_LENGTH);
            return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
        }

        return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
    }

    /**
     * Decrypt data
     * @param {string} ciphertext 
     * @param {string} password - Optional password
     * @returns {string} Decrypted plaintext
     */
    decrypt(ciphertext, password = null) {
        if (!ciphertext || !ciphertext.includes(':')) return ciphertext;

        try {
            const parts = ciphertext.split(':');
            let iv, tag, encrypted, key;

            if (parts.length === 4) {
                // Password-derived encryption
                const salt = Buffer.from(parts[0], 'hex');
                iv = Buffer.from(parts[1], 'hex');
                tag = Buffer.from(parts[2], 'hex');
                encrypted = parts[3];
                key = this.deriveKey(password, salt);
            } else {
                // Standard encryption
                iv = Buffer.from(parts[0], 'hex');
                tag = Buffer.from(parts[1], 'hex');
                encrypted = parts[2];
                key = this.encryptionKey;
            }

            const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(tag);

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (err) {
            console.error('Decryption failed:', err.message);
            return ciphertext; // Return as-is if can't decrypt
        }
    }

    /**
     * Encrypt entire account object
     * @param {Object} account 
     * @returns {Object}
     */
    encryptAccount(account) {
        if (!account) return account;

        return {
            ...account,
            password: this.encrypt(account.password),
            sharedSecret: account.sharedSecret ? this.encrypt(account.sharedSecret) : '',
            _encrypted: true
        };
    }

    /**
     * Decrypt entire account object
     * @param {Object} account 
     * @returns {Object}
     */
    decryptAccount(account) {
        if (!account || !account._encrypted) return account;

        return {
            ...account,
            password: this.decrypt(account.password),
            sharedSecret: account.sharedSecret ? this.decrypt(account.sharedSecret) : '',
            _encrypted: false
        };
    }

    /**
     * Hash password for comparison
     * @param {string} password 
     * @returns {string}
     */
    hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
        return `${salt}:${hash}`;
    }

    /**
     * Verify hashed password
     * @param {string} password 
     * @param {string} hashedPassword 
     * @returns {boolean}
     */
    verifyPassword(password, hashedPassword) {
        const [salt, hash] = hashedPassword.split(':');
        const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
        return hash === verifyHash;
    }

    /**
     * Generate secure random token
     * @param {number} length 
     * @returns {string}
     */
    generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }
}

module.exports = new CryptoManager();