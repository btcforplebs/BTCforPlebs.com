import { state } from './state.js';

const CACHE_VERSION = 2;
const CACHE_KEY_PREFIX = 'nostr_dm_cache_';
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

export const CacheEncryption = {
    async deriveKey(pubkey) {
        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(pubkey),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        const salt = encoder.encode('nostr-dm-cache-v1');

        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    async encrypt(data, pubkey) {
        try {
            const key = await this.deriveKey(pubkey);
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(JSON.stringify(data));
            const iv = window.crypto.getRandomValues(new Uint8Array(12));

            const encryptedBuffer = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                dataBuffer
            );

            const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(encryptedBuffer), iv.length);

            let binary = '';
            for (let i = 0; i < combined.byteLength; i++) {
                binary += String.fromCharCode(combined[i]);
            }
            return btoa(binary);
        } catch (error) {
            console.error('Encryption failed:', error);
            throw error;
        }
    },

    async decrypt(encryptedData, pubkey) {
        try {
            const key = await this.deriveKey(pubkey);
            const binary = atob(encryptedData);
            const combined = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                combined[i] = binary.charCodeAt(i);
            }

            const iv = combined.slice(0, 12);
            const data = combined.slice(12);

            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );

            const decoder = new TextDecoder();
            return JSON.parse(decoder.decode(decryptedBuffer));
        } catch (error) {
            console.error('Decryption failed:', error);
            throw error;
        }
    }
};

export async function saveMessagesToCache(pubkey) {
    try {
        const cacheData = {
            version: CACHE_VERSION,
            timestamp: Date.now(),
            conversations: Array.from(state.conversations.entries()).map(([key, value]) => ({
                pubkey: key,
                messages: value.messages,
                lastMessage: value.lastMessage,
                unread: value.unread,
                lastReadTimestamp: value.lastReadTimestamp || 0
            })),
            lastSyncTimestamp: state.lastSyncTimestamp
        };

        const encrypted = await CacheEncryption.encrypt(cacheData, pubkey);
        localStorage.setItem(CACHE_KEY_PREFIX + pubkey + '_v' + CACHE_VERSION, encrypted);
        console.log('💾🔒 Saved', state.conversations.size, 'conversations to encrypted cache');
        // UI Update (updateCacheInfo) should be called by the invoker
    } catch (error) {
        console.error('Failed to save cache:', error);
    }
}

export async function loadMessagesFromCache(pubkey) {
    try {
        const cached = localStorage.getItem(CACHE_KEY_PREFIX + pubkey + '_v' + CACHE_VERSION);
        if (!cached) {
            console.log('No cache found');
            return false;
        }

        const cacheData = await CacheEncryption.decrypt(cached, pubkey);

        if (cacheData.version !== CACHE_VERSION) {
            console.log('Cache version mismatch');
            return false;
        }

        const cacheAge = Date.now() - cacheData.timestamp;
        if (cacheAge > MAX_CACHE_AGE) {
            console.log('Cache too old');
            return false;
        }

        state.conversations.clear();
        cacheData.conversations.forEach(conv => {
            state.conversations.set(conv.pubkey, {
                messages: conv.messages,
                lastMessage: conv.lastMessage,
                unread: conv.unread || 0,
                lastReadTimestamp: conv.lastReadTimestamp || 0
            });
        });

        state.lastSyncTimestamp = cacheData.lastSyncTimestamp || 0;

        console.log('✅🔓 Loaded', state.conversations.size, 'conversations from encrypted cache');
        console.log('Last sync:', new Date(state.lastSyncTimestamp * 1000).toLocaleString());

        // UI rendering should be handled by the invoker
        return true;
    } catch (error) {
        console.error('Failed to load cache:', error);
        return false;
    }
}
