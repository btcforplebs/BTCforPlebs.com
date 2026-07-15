
import { state } from './modules/state.js';
import { NIP46Client, bytesToHex, hexToBytes } from './modules/nip46.js';
import { loadMessagesFromCache } from './modules/crypto.js';
import {
    showStatus, renderConversations, renderChat, filterConversations,
    handleKeyPress, markAllAsRead, showNewChatModal, hideNewChatModal,
    startNewChat, navigateConversations, initSwipeBack, backToConversations,
    updateNotificationBadge, fullResync, openChat, updateEncryptionToggle,
    showLogs
} from './modules/ui.js';
import {
    loadDMs, sendDM, discoverRelays, scanUserActivity, toggleEncryptionProtocol,
    fetchAllProfiles
} from './modules/messages.js';

const { nip19, generateSecretKey, getPublicKey, nip44 } = window.NostrTools;

// ============================================
// 🌍 GLOBAL EXPORTS (for HTML Event Handlers)
// ============================================
window.state = state;
window.connectWithBunker = connectWithBunker;
window.fullResync = fullResync;
window.showSettingsModal = showSettingsModal;
window.showNotificationSettings = showNotificationSettings;
window.disconnect = disconnect;
window.showNewChatModal = showNewChatModal;
window.markAllAsRead = markAllAsRead;
window.backToConversations = backToConversations;
window.sendDM = sendDM;
window.addRelay = addRelay;
window.setDefaultRelays = setDefaultRelays;
window.discoverRelays = discoverRelays;
window.scanUserActivity = scanUserActivity;
window.hideSettingsModal = hideSettingsModal;
window.hideNewChatModal = hideNewChatModal;
window.startNewChat = startNewChat;
window.filterConversations = filterConversations;
window.handleKeyPress = handleKeyPress;
window.toggleEncryptionProtocol = toggleEncryptionProtocol;
window.initDashboard = initDashboard;
window.openChat = openChat; // Required for list item clicks
window.showLogs = showLogs;

// ============================================
// 🚀 INITIALIZATION
// ============================================

window.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Page loaded (Module System), checking for saved session...');
    initSwipeBack();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(console.error);
    }

    const restored = await restoreSession();
    if (!restored) {
        console.log('No valid session, showing login screen');
        // Check for URL params (NIP-46 redirect)
        const urlParams = new URLSearchParams(window.location.search);
        const bunkerUrl = urlParams.get('bunker');
        if (bunkerUrl) {
            handleBunkerUrl(bunkerUrl);
        }
    }

    // Add floating log button for debug
    const logBtn = document.createElement('button');
    logBtn.innerText = '🐞';
    logBtn.style.cssText = 'position: fixed; bottom: 10px; right: 10px; z-index: 9999; background: #333; border: 1px solid #555; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 20px;';
    logBtn.title = 'Show Debug Logs';
    logBtn.onclick = () => window.showLogs();
    document.body.appendChild(logBtn);


    // NIP-44 Diagnostic
    try {
        const _nip44 = nip44.v2 || nip44;
        const sk = generateSecretKey();
        const pk = getPublicKey(sk);
        const k = _nip44.utils.getConversationKey(sk, pk);
        if (_nip44.decrypt(_nip44.encrypt('t', k), k) === 't') console.log('✅ NIP-44 Check Passed');
        else console.error('❌ NIP-44 Check Failed');
    } catch (e) { console.error('❌ NIP-44 CRASH:', e); }

    // Start health check
    startHealthCheck();
});

// ============================================
// 🔐 SESSION & CONNECTION
// ============================================

async function restoreSession() {
    // 1. Check Bunker Session
    const bunkerSession = localStorage.getItem('bunker_session');
    if (bunkerSession) {
        console.log('🔄 Restoring Bunker session...');
        try {
            const sessionData = JSON.parse(bunkerSession);
            state.userPubkey = sessionData.userPubkey;
            state.userPrivkey = null; // Read-only or remote signing

            // Convert hex string back to Uint8Array
            const localSecretKey = hexToBytes(sessionData.localPrivkeyHex);
            const relays = sessionData.relays || state.currentRelays;

            // Create client with explicit parameters
            const client = new NIP46Client(
                state.pool,
                relays,
                localSecretKey,
                sessionData.remotePubkey,
                sessionData.secret
            );

            state.nip46Connection = client;

            // Re-establish subscription and connection
            await client.connect();

            showStatus('Connected via Bunker', 'success');
            await initDashboard();
            return true;
        } catch (e) {
            console.error('Bunker restore failed:', e);
            localStorage.removeItem('bunker_session');
        }
    }

    return false;
}

async function handleBunkerUrl(url) {
    console.log('🔗 Handling Bunker URL:', url);
    // Parse nip46 URI: nostrconnect://<pubkey>?relay=...
    // Implementation of parsing logic (simplified)
    if (url.startsWith('nostrconnect://')) {
        const parts = url.replace('nostrconnect://', '').split('?');
        const remotePubkey = parts[0];
        const params = new URLSearchParams(parts[1]);
        const relays = params.getAll('relay');

        if (remotePubkey) {
            connectWithBunker(remotePubkey, relays);
        }
    }
}

async function connectWithBunker(remotePubkeyInput = null, relaysInput = null, secretInput = null) {
    if (state.isConnecting) return;
    state.isConnecting = true;
    showStatus('Connecting to Bunker...', 'info');

    try {
        let remotePubkey = remotePubkeyInput;
        let relays = relaysInput;
        let secret = secretInput;

        // If called from UI click
        if (!remotePubkey && document.getElementById('bunkerInput')) {
            const input = document.getElementById('bunkerInput').value.trim();

            if (input.includes('://')) {
                // Parse bunker:// or nostrconnect:// URI
                console.log('🔗 Parsing Bunker URI:', input);
                const data = input.split('://')[1].split('?');
                remotePubkey = data[0];

                if (data[1]) {
                    const params = new URLSearchParams(data[1]);
                    relays = params.getAll('relay');
                    secret = params.get('secret') || undefined;
                    console.log('🔗 Found relays:', relays);
                    if (secret) console.log('🔗 Found secret');
                }
            } else {
                remotePubkey = input;
            }
        }

        if (!remotePubkey) throw new Error('No Bunker URI provided');

        // Handle npub encoding
        if (remotePubkey.startsWith('npub1')) {
            const { data } = nip19.decode(remotePubkey);
            remotePubkey = data;
        }

        // Handle nprofile encoding
        if (remotePubkey.startsWith('nprofile1')) {
            const { data } = nip19.decode(remotePubkey);
            remotePubkey = data.pubkey;
            if (data.relays && data.relays.length > 0) {
                relays = data.relays;
            }
        }

        // Validate hex pubkey
        if (!/^[0-9a-f]{64}$/.test(remotePubkey)) {
            throw new Error('Invalid public key format (hex or npub required)');
        }

        // Use provided relays or fall back to defaults
        const connectionRelays = (relays && relays.length > 0) ? relays : state.currentRelays;

        // Generate local secret key for this connection
        const localSecretKey = generateSecretKey();

        // Create client with explicit parameters (Signet-compatible)
        const client = new NIP46Client(
            state.pool,
            connectionRelays,
            localSecretKey,
            remotePubkey,
            secret
        );

        state.nip46Connection = client;

        // Connect to the bunker
        const connectResult = await client.connect();
        console.log('✅ Connect result:', connectResult);

        // Get the user's public key from the signer
        showStatus('Verifying identity...', 'info');
        const userPubkey = await client.getPublicKey();
        if (!userPubkey) throw new Error('Failed to get public key');

        state.userPubkey = userPubkey;
        console.log('✅ Identity Verified:', userPubkey);

        // Save session with hex-encoded keys
        const session = {
            userPubkey,
            localPrivkeyHex: bytesToHex(localSecretKey),
            localPubkey: client.localPubkey,
            remotePubkey: client.remotePubkey,
            relays: connectionRelays,
            secret: secret
        };
        localStorage.setItem('bunker_session', JSON.stringify(session));

        await initDashboard();

    } catch (e) {
        console.error('Connection failed:', e);

        // Handle auth URL error (requires user approval)
        if (e.message.startsWith('AUTH_URL:')) {
            const authUrl = e.message.replace('AUTH_URL:', '');
            showStatus('Authorization required', 'warning');

            const openAuth = confirm('Your signer requires approval. Click OK to open the approval page.');
            if (openAuth) {
                window.open(authUrl, '_blank');
                showStatus('Please approve the request, then try connecting again.', 'info');
            }
        } else {
            showStatus('Connection failed: ' + e.message, 'error');
        }

        state.nip46Connection = null;
    } finally {
        state.isConnecting = false;
    }
}

function disconnect() {
    if (confirm('Disconnect form Bunker?')) {
        localStorage.removeItem('bunker_session');
        location.reload();
    }
}

// ============================================
// 🖥️ DASHBOARD MANAGEMENT
// ============================================

async function initDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');

    state.connectionActive = true;

    // Load Cache
    if (state.userPubkey) {
        await loadMessagesFromCache(state.userPubkey);
        renderConversations();
    }

    // Start Sync
    loadDMs();

    // Fetch Profiles
    fetchAllProfiles();

    // Check Notifications
    if (Notification.permission === 'granted') updateNotificationBadge();
}

function startHealthCheck() {
    if (state.healthCheckInterval) clearInterval(state.healthCheckInterval);
    state.healthCheckInterval = setInterval(() => {
        if (!state.userPubkey || document.visibilityState !== 'visible') return;
        if ((Date.now() / 1000) - state.lastSyncTimestamp > 1200) {
            console.log('⚠️ Watchdog: Re-syncing...');
            loadDMs();
        }
    }, 60000);
}

// ============================================
// ⚙️ SETTINGS & HELPERS
// ============================================

function showSettingsModal() {
    document.getElementById('settingsModal').classList.remove('hidden');
    renderRelayList();
}

function hideSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

function renderRelayList() {
    const list = document.getElementById('relayList');
    if (!list) return;
    list.innerHTML = state.currentRelays.map(r => `
        <div class="relay-item">
            <span>${r}</span>
            <button onclick="removeRelay('${r}')" style="color:var(--danger)">🗑️</button>
        </div>
    `).join('');
    // Attach remove handlers via global or event delegation needed if using innerHTML
    // Simpler: use index or just delegate
    // Since we export removeRelay... wait, I didn't export removeRelay.
}

window.removeRelay = function (url) {
    if (confirm(`Remove ${url}?`)) {
        state.currentRelays = state.currentRelays.filter(r => r !== url);
        localStorage.setItem('user_relays', JSON.stringify(state.currentRelays));
        renderRelayList();
        showStatus('Relay removed (reload to apply fully)', 'warning');
    }
}

function addRelay() {
    const input = document.getElementById('newRelayInput');
    const url = input.value.trim();
    if (!url.startsWith('wss://')) {
        alert('Must start with wss://');
        return;
    }
    if (!state.currentRelays.includes(url)) {
        state.currentRelays.push(url);
        localStorage.setItem('user_relays', JSON.stringify(state.currentRelays));
        renderRelayList();
        input.value = '';
    }
}

function setDefaultRelays() {
    if (confirm('Reset to default relays?')) {
        localStorage.removeItem('user_relays');
        location.reload();
    }
}

// ============================================
// 🔔 NOTIFICATIONS
// ============================================

function showNotificationSettings() {
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => {
            state.notificationPermission = p;
            updateNotificationBadge();
        });
    } else {
        alert('Notifications are ' + Notification.permission);
    }
}

// Visibility Handler
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.userPubkey) {
        state.closeAllSubscriptions(); // Force clean slate
        loadDMs();
    }
});
