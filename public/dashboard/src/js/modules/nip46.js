/**
 * NIP-46 Client - Signet-compatible implementation
 * Based on: https://github.com/pablof7z/signet/blob/main/apps/signet/src/client.ts
 */

const { generateSecretKey, getPublicKey, finalizeEvent, nip44, verifyEvent } = window.NostrTools;
import { state } from './state.js';

/**
 * Convert Uint8Array to hex string for storage
 */
export function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to Uint8Array for restoration
 */
export function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

/**
 * Generate a random request ID (matches Signet format)
 */
function generateRequestId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * NIP-46 Remote Signer Client
 * Communicates with a remote signer (like Signet) using Nostr events.
 */
export class NIP46Client {
    /**
     * @param {SimplePool} pool - nostr-tools SimplePool instance
     * @param {string[]} relays - Array of relay URLs to use
     * @param {Uint8Array} localSecretKey - 32-byte secret key for this client
     * @param {string} remotePubkey - Hex pubkey of the remote signer (bunker)
     * @param {string} [secret] - Optional connection secret from bunker URI
     */
    constructor(pool, relays, localSecretKey, remotePubkey, secret) {
        this.pool = pool;
        this.relays = relays;
        this.localSecretKey = localSecretKey;
        this.localPubkey = getPublicKey(localSecretKey);
        this.remotePubkey = remotePubkey;
        this.secret = secret;
        this.pendingRequests = new Map();
        this.unsubscribe = null;
        this.connected = false;

        console.log('[NIP46] Client created');
        console.log('[NIP46] Local pubkey:', this.localPubkey.slice(0, 16) + '...');
        console.log('[NIP46] Remote pubkey:', this.remotePubkey.slice(0, 16) + '...');
        console.log('[NIP46] Relays:', this.relays);
    }

    /**
     * Connect to the remote signer.
     * Subscribes to responses first, then sends connect request.
     * @returns {Promise<string>} - The result of the connect request (usually 'ack')
     */
    async connect() {
        console.log('[NIP46] Starting connection flow...');

        // Step 1: Ensure we're connected to relays
        await this.ensureRelayConnections();

        // Step 2: Subscribe to responses BEFORE sending request
        this.subscribeToResponses();

        // Step 3: Send connect request
        const params = [this.localPubkey];
        if (this.secret) {
            params.push(this.secret);
        }

        console.log('[NIP46] Sending connect request with params:', params.map(p => p.slice(0, 16) + '...'));

        try {
            const result = await this.sendRequest('connect', params, 60000);
            console.log('[NIP46] Connect result:', result);

            if (result === 'ack' || result === this.remotePubkey) {
                this.connected = true;
                console.log('[NIP46] ✅ Connected successfully!');
                return result;
            }

            // Some signers return the pubkey instead of 'ack'
            this.connected = true;
            return result;
        } catch (error) {
            console.error('[NIP46] Connect failed:', error.message);
            throw error;
        }
    }

    /**
     * Ensure relay connections are ready before subscribing.
     */
    async ensureRelayConnections() {
        console.log('[NIP46] Ensuring relay connections...');

        const connectionPromises = this.relays.map(async (url) => {
            try {
                const relay = await this.pool.ensureRelay(url);
                // Check WebSocket state
                if (relay.ws && relay.ws.readyState === 1) {
                    console.log(`[NIP46] ✅ Connected to ${url}`);
                    return true;
                }
                // Wait a bit for connection
                await new Promise(resolve => setTimeout(resolve, 500));
                if (relay.ws && relay.ws.readyState === 1) {
                    console.log(`[NIP46] ✅ Connected to ${url} (after wait)`);
                    return true;
                }
                console.warn(`[NIP46] ⚠️ Relay ${url} not connected (state: ${relay.ws?.readyState})`);
                return false;
            } catch (e) {
                console.warn(`[NIP46] ❌ Failed to connect to ${url}:`, e.message);
                return false;
            }
        });

        const results = await Promise.all(connectionPromises);
        const connectedCount = results.filter(Boolean).length;

        if (connectedCount === 0) {
            throw new Error('Failed to connect to any relay');
        }

        console.log(`[NIP46] Connected to ${connectedCount}/${this.relays.length} relays`);
    }

    /**
     * Subscribe to NIP-46 response events.
     * Matches Signet's filter: kinds: [24133], #p: [localPubkey]
     */
    subscribeToResponses() {
        if (this.unsubscribe) {
            console.log('[NIP46] Closing existing subscription');
            this.unsubscribe();
        }

        // Primary filter: events addressed to us
        const filters = [
            { kinds: [24133], '#p': [this.localPubkey] }
        ];

        // Debug filter: also listen for ANY event from the bunker pubkey
        if (this.remotePubkey) {
            filters.push({ kinds: [24133], authors: [this.remotePubkey], limit: 5 });
        }

        console.log('[NIP46] Subscribing with filters:', JSON.stringify(filters));
        console.log('[NIP46] Listening on relays:', this.relays);

        const sub = this.pool.subscribeMany(
            this.relays,
            filters,
            {
                onevent: (event) => {
                    console.log('[NIP46] 📩 Received event:', {
                        from: event.pubkey.slice(0, 16) + '...',
                        tags: event.tags,
                        id: event.id.slice(0, 16) + '...'
                    });
                    this.handleResponse(event).catch(err => {
                        console.error('[NIP46] Error handling response:', err);
                    });
                },
                oneose: () => {
                    console.log('[NIP46] EOSE received - subscription active');
                },
                onclose: (reasons) => {
                    console.warn('[NIP46] Subscription closed:', reasons);
                }
            }
        );

        this.unsubscribe = () => sub.close();
        console.log('[NIP46] Subscription created');
    }

    /**
     * Handle an incoming NIP-46 response event.
     * Decrypts with NIP-44 and resolves/rejects pending request.
     */
    async handleResponse(event) {
        // Verify event signature
        if (!verifyEvent(event)) {
            console.warn('[NIP46] Invalid event signature, ignoring');
            return;
        }

        // Only accept responses from the remote signer we're connected to
        if (event.pubkey !== this.remotePubkey) {
            console.log('[NIP46] Ignoring event from unexpected pubkey:', event.pubkey.slice(0, 16) + '...');
            return;
        }

        // Decrypt response using NIP-44
        let response;
        try {
            const _nip44 = nip44.v2 || nip44;
            const _utils = _nip44.utils || _nip44;
            const conversationKey = _utils.getConversationKey(this.localSecretKey, event.pubkey);
            const decrypted = _nip44.decrypt(event.content, conversationKey);
            response = JSON.parse(decrypted);
            console.log('[NIP46] 📨 Decrypted response:', response);
        } catch (err) {
            console.error('[NIP46] Failed to decrypt response:', err.message);
            return;
        }

        // Find and resolve the pending request
        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
            console.log('[NIP46] No pending request for id:', response.id);
            return;
        }

        this.pendingRequests.delete(response.id);
        clearTimeout(pending.timeout);

        if (response.error) {
            // Check if it's an auth URL (requires user approval)
            if (response.error.startsWith('http')) {
                console.log('[NIP46] 🔐 Auth URL received:', response.error);
                pending.reject(new Error(`AUTH_URL:${response.error}`));
            } else {
                pending.reject(new Error(response.error));
            }
        } else {
            pending.resolve(response.result ?? '');
        }
    }

    /**
     * Send a NIP-46 request to the remote signer.
     * @param {string} method - The method to call (connect, get_public_key, sign_event, etc.)
     * @param {string[]} params - Array of string parameters
     * @param {number} [timeoutMs=60000] - Timeout in milliseconds
     * @returns {Promise<string>} - The result from the signer
     */
    async sendRequest(method, params, timeoutMs = 60000) {
        const id = generateRequestId();
        const request = { id, method, params };

        console.log(`[NIP46] 📤 Sending request: ${method} (${id})`);

        // Encrypt with NIP-44
        const _nip44 = nip44.v2 || nip44;
        const _utils = _nip44.utils || _nip44;
        const conversationKey = _utils.getConversationKey(this.localSecretKey, this.remotePubkey);
        const encrypted = _nip44.encrypt(JSON.stringify(request), conversationKey);

        // Create and sign the event
        const event = finalizeEvent({
            kind: 24133,
            content: encrypted,
            tags: [['p', this.remotePubkey]],
            created_at: Math.floor(Date.now() / 1000)
        }, this.localSecretKey);

        // Create response promise with timeout
        const responsePromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timed out'));
                }
            }, timeoutMs);

            this.pendingRequests.set(id, { resolve, reject, timeout });
        });

        // Publish to all relays
        console.log('[NIP46] Publishing to relays...');
        const publishResults = await Promise.allSettled(this.pool.publish(this.relays, event));

        const successes = publishResults.filter(r => r.status === 'fulfilled').length;
        const failures = publishResults.filter(r => r.status === 'rejected');

        console.log(`[NIP46] Published to ${successes}/${this.relays.length} relays`);

        if (successes === 0) {
            // Remove pending request since we couldn't publish
            this.pendingRequests.delete(id);
            const errors = failures.map(f => f.reason?.message || 'Unknown').join(', ');
            throw new Error(`Failed to publish to any relay: ${errors}`);
        }

        return responsePromise;
    }

    /**
     * Get the public key from the remote signer.
     */
    async getPublicKey() {
        if (!this.connected) throw new Error('Not connected');
        return this.sendRequest('get_public_key', []);
    }

    /**
     * Sign an event using the remote signer.
     * @param {Object} event - Unsigned event object
     * @returns {Promise<Object>} - Signed event
     */
    async signEvent(event) {
        if (!this.connected) throw new Error('Not connected');
        const result = await this.sendRequest('sign_event', [JSON.stringify(event)]);
        return typeof result === 'string' ? JSON.parse(result) : result;
    }

    /**
     * NIP-04 encrypt using remote signer.
     */
    async nip04Encrypt(pubkey, plaintext) {
        if (!this.connected) throw new Error('Not connected');
        return this.sendRequest('nip04_encrypt', [pubkey, plaintext]);
    }

    /**
     * NIP-04 decrypt using remote signer.
     */
    async nip04Decrypt(pubkey, ciphertext) {
        if (!this.connected) throw new Error('Not connected');
        return this.sendRequest('nip04_decrypt', [pubkey, ciphertext]);
    }

    /**
     * NIP-44 encrypt using remote signer.
     */
    async nip44Encrypt(pubkey, plaintext) {
        if (!this.connected) throw new Error('Not connected');
        return this.sendRequest('nip44_encrypt', [pubkey, plaintext]);
    }

    /**
     * NIP-44 decrypt using remote signer.
     */
    async nip44Decrypt(pubkey, ciphertext) {
        if (!this.connected) throw new Error('Not connected');
        return this.sendRequest('nip44_decrypt', [pubkey, ciphertext]);
    }

    /**
     * Close the client and cleanup.
     */
    close() {
        console.log('[NIP46] Closing client');
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        // Clear any pending requests
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Client closed'));
        }
        this.pendingRequests.clear();
        this.connected = false;
    }
}
