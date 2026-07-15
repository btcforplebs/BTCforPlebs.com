const { SimplePool } = window.NostrTools;

export class AppState {
    constructor() {
        this.pool = new SimplePool();
        this.userPubkey = null;
        this.userPrivkey = null;
        this.nip46Connection = null;
        this.currentRelays = this.loadRelays() || [
            'wss://relay.primal.net',
            'wss://relay.btcforplebs.com',
            'wss://relay.damus.io',
            'wss://nos.lol',
            'wss://relay.0xchat.com'
        ];
        this.subscriptions = [];
        this.conversations = new Map();
        this.currentChatPubkey = null;
        this.lastSyncTimestamp = 0;
        this.selectedConversationIndex = -1;
        this.conversationsList = [];
        this.profileCache = new Map();
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.healthCheckInterval = null;
        this.autoSaveInterval = null;
        this.pendingMessages = new Set();
        this.recentlySentContents = new Map(); // Map<contentHash, timestamp> to skip echoed messages
        this.connectionActive = false;
        this.renderThrottle = null;
        this.decryptionQueue = [];
        this.activeDecryptions = 0;
        this.MAX_CONCURRENT_DECRYPTS = 5; // Reduced from 50 to prevent relay flooding
        this.pendingOperations = 0;
        this.isSyncing = false;
        this.notificationPermission = 'default';
        this.serviceWorkerRegistration = null;
    }

    async executeQueued(task) {
        return new Promise((resolve, reject) => {
            this.decryptionQueue.push({ task, resolve, reject });
            this.processQueue();
        });
    }

    loadRelays() {
        try {
            const saved = localStorage.getItem('user_relays');
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.error('Error loading relays:', e);
        }
        return null;
    }

    async processQueue() {
        if (this.decryptionQueue.length === 0) {
            return;
        }

        // Process as many as allowed by concurrency limit
        while (this.activeDecryptions < this.MAX_CONCURRENT_DECRYPTS && this.decryptionQueue.length > 0) {
            this.activeDecryptions++;
            const { task, resolve, reject } = this.decryptionQueue.shift();

            // Run task without blocking the loop
            task().then(result => {
                resolve(result);
            }).catch(err => {
                reject(err);
            }).finally(() => {
                this.activeDecryptions--;
                this.processQueue(); // Trigger next item immediately
            });
        }
    }

    reset() {
        this.closeAllSubscriptions();
        if (this.renderThrottle) clearTimeout(this.renderThrottle);
        // Pool is managed by SimplePool, closing logic might need verification in multi-module setup
        // But for now, copying existing logic
        if (this.pool) {
            // SimplePool close might not take arguments in newer versions or might be different, 
            // but keeping original logic: this.pool.close(this.currentRelays);
            try { this.pool.close(this.currentRelays); } catch (e) { }
        }
        if (this.nip46Connection) this.nip46Connection.close();
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
        if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);

        // Re-init pool on reset? Or just null it? Original logic nulls it.
        this.pool = null;

        this.userPubkey = null;
        this.userPrivkey = null;
        this.nip46Connection = null;
        this.subscriptions = [];
        this.conversations.clear();
        this.currentChatPubkey = null;
        this.lastSyncTimestamp = 0;
        this.profileCache.clear();
        this.pendingMessages.clear();
        this.connectionActive = false;
    }

    closeAllSubscriptions() {
        this.subscriptions.forEach(sub => {
            try {
                sub.close();
            } catch (e) {
                console.error('Error closing subscription:', e);
            }
        });
        this.subscriptions = [];
    }
}

// Global state instance
export const state = new AppState();
