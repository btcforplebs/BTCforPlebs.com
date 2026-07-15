import { state } from './state.js';
const { nip19, nip44, nip04, finalizeEvent, generateSecretKey, getPublicKey, SimplePool } = window.NostrTools;

import { showStatus, showNotification, renderConversations, renderChat, updateEncryptionToggle, updateCacheInfo } from './ui.js';
import { saveMessagesToCache } from './crypto.js';

// Accessing globals helper
const tools = window.NostrTools;

// ============================================
// 👤 PROFILE MANAGEMENT
// ============================================

export function getDisplayName(pubkey) {
    const profile = state.profileCache.get(pubkey);
    if (profile && (profile.displayName || profile.name)) {
        return profile.displayName || profile.name;
    }
    return pubkey === state.userPubkey ? 'Me' : nip19.npubEncode(pubkey).substring(0, 10) + '...';
}

function getProfileCacheKey(pubkey) {
    return `nostr_profile_${pubkey}`;
}

export async function fetchProfile(pubkey) {
    const cached = state.profileCache.get(pubkey);
    if (cached) return cached;

    try {
        const stored = localStorage.getItem(getProfileCacheKey(pubkey));
        if (stored) {
            const profile = JSON.parse(stored);
            const age = Date.now() - profile.timestamp;

            state.profileCache.set(pubkey, profile);

            if (age >= 24 * 60 * 60 * 1000) {
                fetchProfileNetwork(pubkey).catch(e => console.error(e));
            }
            return profile;
        }
    } catch (e) { console.error(e); }

    return fetchProfileNetwork(pubkey);
}

async function fetchProfileNetwork(pubkey) {
    try {
        const event = await state.pool.get(state.currentRelays, {
            kinds: [0],
            authors: [pubkey]
        });

        if (event) {
            const content = JSON.parse(event.content);
            const profile = {
                name: content.name,
                displayName: content.display_name,
                picture: content.picture,
                about: content.about,
                timestamp: Date.now()
            };

            state.profileCache.set(pubkey, profile);
            localStorage.setItem(getProfileCacheKey(pubkey), JSON.stringify(profile));
            updateCacheInfo();
            // Optional: re-render list if visible
            // renderConversations(); 
            return profile;
        }
    } catch (e) {
        console.error('Error fetching profile:', e);
    }
    return null;
}

export function fetchAllProfiles() {
    state.conversations.forEach((_, pubkey) => {
        if (!state.profileCache.has(pubkey)) {
            fetchProfile(pubkey);
        }
    });
}

// ============================================
// 💬 MESSAGE PROCESSING & SYNC
// ============================================

export async function processDM(event) {
    if (event.kind === 1059) {
        return await unwrapGiftWrap(event);
    }

    if (state.pendingMessages.has(event.id)) {
        return false;
    }
    state.pendingMessages.add(event.id);

    try {
        const otherPubkey = event.pubkey === state.userPubkey
            ? event.tags.find(t => t[0] === 'p')?.[1]
            : event.pubkey;

        if (!otherPubkey) {
            state.pendingMessages.delete(event.id);
            return false;
        }

        return await insertMessageIntoConversation(event, otherPubkey, event.content, false);

    } catch (err) {
        console.error(`[processDM] Critical error for event ${event.id}:`, err);
        state.pendingMessages.delete(event.id);
        return false;
    }
}

export async function insertMessageIntoConversation(event, otherPubkey, content, isDecrypted = true) {
    const messageId = event.id;

    if (!state.conversations.has(otherPubkey)) {
        state.conversations.set(otherPubkey, {
            messages: [],
            lastMessage: null,
            unread: 0,
            lastReadTimestamp: 0
        });
    }

    const conversation = state.conversations.get(otherPubkey);

    const existingMsg = conversation.messages.find(m => m.id === messageId);
    if (existingMsg) {
        if (!existingMsg.decrypted && isDecrypted) {
            console.log(`🔓 Updating previously encrypted message ${messageId.substring(0, 8)}`);
            existingMsg.content = content;
            existingMsg.decrypted = true;
            renderConversations();
            if (state.currentChatPubkey === otherPubkey) {
                renderChat(state.currentChatPubkey);
            }
            return true;
        }
        return false;
    }

    const message = {
        id: messageId,
        content: content,
        decrypted: isDecrypted,
        timestamp: event.created_at,
        from: event.pubkey,
        isSent: event.pubkey === state.userPubkey
    };

    if (message.isSent && isDecrypted) {
        const tempIndex = conversation.messages.findIndex(m =>
            m.id.startsWith('temp_') &&
            m.content === content &&
            Math.abs(m.timestamp - message.timestamp) < 60
        );

        if (tempIndex !== -1) {
            conversation.messages[tempIndex] = message;
            if (conversation.lastMessage?.id?.startsWith('temp_')) {
                conversation.lastMessage = message;
            }
            const sentKey = `${otherPubkey}_${content}`;
            state.recentlySentContents.delete(sentKey);

            renderConversations();
            if (state.currentChatPubkey === otherPubkey) {
                renderChat(state.currentChatPubkey);
            }
            return false;
        }

        const sentKey = `${otherPubkey}_${content}`;
        const sentTime = state.recentlySentContents.get(sentKey);
        if (sentTime && (Date.now() - sentTime) < 60000) {
            state.recentlySentContents.delete(sentKey);
            return false;
        }
    }

    const index = conversation.messages.findIndex(m => m.timestamp > message.timestamp);
    if (index === -1) {
        conversation.messages.push(message);
    } else {
        conversation.messages.splice(index, 0, message);
    }

    conversation.lastMessage = conversation.messages[conversation.messages.length - 1];

    if (!message.isSent && otherPubkey !== state.currentChatPubkey && message.timestamp > conversation.lastReadTimestamp) {
        conversation.unread++;
        if (isDecrypted) {
            // Can be verbose, disable if annoying
            /*
            const senderName = getDisplayName(otherPubkey);
            const preview = content.length > 50 ? content.substring(0, 50) + '...' : content;
            showNotification(`New message from ${senderName}`, preview, otherPubkey);
            */
        }
    }

    renderConversations();
    state.pendingMessages.delete(messageId);

    if (state.currentChatPubkey === otherPubkey) {
        renderChat(state.currentChatPubkey);
    }

    return true;
}

export async function decryptConversationMessages(pubkey) {
    const conversation = state.conversations.get(pubkey);
    if (!conversation) return;

    const encryptedMessages = conversation.messages.filter(m => !m.decrypted);
    if (encryptedMessages.length === 0) return;

    console.log(`🔓 Lazy decrypting ${encryptedMessages.length} messages for ${pubkey}...`);

    for (const msg of encryptedMessages) {
        try {
            let decrypted;
            if (state.nip46Connection) {
                decrypted = await state.executeQueued(() => state.nip46Connection.nip04Decrypt(pubkey, msg.content));
            } else {
                decrypted = await nip04.decrypt(state.userPrivkey, pubkey, msg.content);
            }

            if (decrypted) {
                msg.content = decrypted;
                msg.decrypted = true;

                if (state.currentChatPubkey === pubkey) {
                    const msgEl = document.getElementById(`msg-${msg.id}`);
                    if (msgEl) {
                        msgEl.querySelector('.content').textContent = decrypted;
                        msgEl.classList.remove('encrypted');
                    } else {
                        renderChat(pubkey);
                    }
                }
            }
        } catch (e) {
            console.error(`Failed to decrypt message ${msg.id}:`, e);
        }
    }
    renderConversations();
}

async function unwrapGiftWrap(giftWrap) {
    if (state.pendingMessages.has(giftWrap.id)) return false;
    state.pendingMessages.add(giftWrap.id);

    try {
        let sealContent;
        try {
            if (state.nip46Connection) {
                console.log(`[NIP17-Debug] Decrypting seal via Bunker for ${giftWrap.id}...`);
                sealContent = await state.executeQueued(() => state.nip46Connection.nip44Decrypt(giftWrap.pubkey, giftWrap.content));
            } else {
                console.log(`[NIP17-Debug] Decrypting seal locally for ${giftWrap.id}...`);
                const conversationKey = nip44.v2.utils.getConversationKey(state.userPrivkey, giftWrap.pubkey);
                sealContent = nip44.v2.decrypt(giftWrap.content, conversationKey);
            }
        } catch (e) {
            console.error(`[unwrapGiftWrap] Decryption failed for giftwrap ${giftWrap.id}:`, e);
            state.pendingMessages.delete(giftWrap.id);
            return false;
        }

        const seal = JSON.parse(sealContent);
        let rumorContent;
        try {
            if (state.nip46Connection) {
                rumorContent = await state.executeQueued(() => state.nip46Connection.nip44Decrypt(seal.pubkey, seal.content));
            } else {
                const conversationKey = nip44.v2.utils.getConversationKey(state.userPrivkey, seal.pubkey);
                rumorContent = nip44.v2.decrypt(seal.content, conversationKey);
            }
        } catch (e) {
            state.pendingMessages.delete(giftWrap.id);
            return false;
        }

        const rumor = JSON.parse(rumorContent);
        if (!rumor.id) rumor.id = giftWrap.id + '_rumor';

        const otherPubkey = rumor.pubkey === state.userPubkey
            ? rumor.tags.find(t => t[0] === 'p')?.[1]
            : rumor.pubkey;

        if (!otherPubkey) {
            state.pendingMessages.delete(giftWrap.id);
            return false;
        }

        const result = await insertMessageIntoConversation(rumor, otherPubkey, rumor.content, true);
        state.pendingMessages.delete(giftWrap.id);
        return result;

    } catch (err) {
        state.pendingMessages.delete(giftWrap.id);
        return false;
    }
}

// ============================================
// 📨 SENDING
// ============================================

export async function sendDM() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();

    if (!content || !state.currentChatPubkey) return;

    try {
        showStatus('Sending...', 'info');

        const prefKey = 'enc_pref_' + state.currentChatPubkey;
        const useNIP04 = localStorage.getItem(prefKey) === 'nip04';

        let eventsToPublish = [];

        if (useNIP04) {
            console.log('🔒 Preference set to NIP-04 (Legacy)');
            try {
                const ev = await createNIP04Message(content, state.currentChatPubkey);
                eventsToPublish = [ev];
                console.log('🚀 [NIP04] Generated Legacy DM (Kind 4)');
            } catch (nip04Err) {
                throw new Error('NIP-04 Send Failed: ' + nip04Err.message);
            }
        } else {
            // Default to NIP-17 with fallback
            try {
                eventsToPublish = await createNIP17Message(content, state.currentChatPubkey);
                console.log(`🚀 [NIP17] Generated ${eventsToPublish.length} Wraps (Kind 1059)`);
            } catch (nip17Err) {
                console.warn('⚠️ NIP-17 (Kind 1059) creation failed:', nip17Err.message);
                showStatus('NIP-17 Failed, using NIP-04', 'warning');
                console.log('🔄 Falling back to NIP-04 (Kind 4)...');

                try {
                    const ev = await createNIP04Message(content, state.currentChatPubkey);
                    eventsToPublish = [ev];
                    console.log('🚀 [NIP04] Generated Legacy DM (Kind 4)');
                } catch (nip04Err) {
                    throw new Error('All send methods failed.');
                }
            }
        }

        const sentKey = `${state.currentChatPubkey}_${content}`;
        state.recentlySentContents.set(sentKey, Date.now());

        // Temp message
        const conversation = state.conversations.get(state.currentChatPubkey) || { messages: [] };
        if (!state.conversations.has(state.currentChatPubkey)) state.conversations.set(state.currentChatPubkey, conversation);

        const tempMessage = {
            id: 'temp_' + Date.now(),
            content,
            timestamp: Math.floor(Date.now() / 1000),
            from: state.userPubkey,
            isSent: true,
            decrypted: true,
            sending: true
        };
        conversation.messages.push(tempMessage);
        conversation.lastMessage = tempMessage;

        renderChat(state.currentChatPubkey);
        renderConversations();
        input.value = '';

        // Publish
        try {
            console.log('🚀 Publishing events:', eventsToPublish.length);

            let recipientRelays = state.currentRelays;

            if (!useNIP04 && eventsToPublish.length >= 1) {
                const inboxRelays = await getRecipientInboxRelays(state.currentChatPubkey);
                if (inboxRelays && inboxRelays.length > 0) {
                    recipientRelays = inboxRelays;
                    console.log(`📬 Using recipient inbox relays: ${recipientRelays.join(', ')}`);
                }
            }

            const publishResults = [];

            for (let i = 0; i < eventsToPublish.length; i++) {
                const ev = eventsToPublish[i];
                const targetRelays = (i === 0) ? recipientRelays : state.currentRelays;
                const label = (i === 0) ? 'Recipient' : 'Self';

                console.log(`📤 Publishing ${label} Wrap to ${targetRelays.length} relays...`);
                try {
                    const pubs = state.pool.publish(targetRelays, ev);
                    await Promise.any(pubs).then(() => {
                        publishResults.push({ label, success: true });
                    }).catch(() => {
                        publishResults.push({ label, success: false });
                    });
                } catch (e) {
                    publishResults.push({ label, success: false });
                }
            }

            showStatus('Sent!', 'success');

        } catch (pubErr) {
            console.warn('Publish failed:', pubErr);
            showStatus('Sent (but check relays)', 'warning');
        }

    } catch (error) {
        showStatus('Send failed: ' + error.message, 'error');
    }
}

async function createNIP04Message(content, recipientPubkey) {
    let encryptedContent;
    if (state.nip46Connection) {
        encryptedContent = await state.nip46Connection.nip04Encrypt(recipientPubkey, content);
    } else {
        encryptedContent = await nip04.encrypt(state.userPrivkey, recipientPubkey, content);
    }
    const event = {
        kind: 4,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', recipientPubkey]],
        content: encryptedContent,
        pubkey: state.userPubkey
    };
    if (state.nip46Connection) return await state.nip46Connection.signEvent(event);
    return finalizeEvent(event, state.userPrivkey);
}

async function createNIP17Message(content, recipientPubkey) {
    const rumor = {
        kind: 14,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', recipientPubkey]],
        content: content,
        pubkey: state.userPubkey
    };
    const rumorJson = JSON.stringify(rumor);
    const _nip44 = nip44.v2 ? nip44.v2 : nip44;
    const _utils = _nip44.utils ? _nip44.utils : _nip44;

    const createWrapForTarget = async (targetPubkey) => {
        let encryptedRumor;
        if (state.nip46Connection) {
            encryptedRumor = await state.nip46Connection.nip44Encrypt(targetPubkey, rumorJson);
        } else {
            const key = _utils.getConversationKey(state.userPrivkey, targetPubkey);
            encryptedRumor = _nip44.encrypt(rumorJson, key);
        }

        const seal = {
            kind: 13,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: encryptedRumor,
            pubkey: state.userPubkey
        };

        let signedSeal;
        if (state.nip46Connection) {
            signedSeal = await state.nip46Connection.signEvent(seal);
        } else {
            signedSeal = finalizeEvent(seal, state.userPrivkey);
        }

        const ephemeralPriv = generateSecretKey();
        const ephemeralPub = getPublicKey(ephemeralPriv);

        const conversationKey = _utils.getConversationKey(ephemeralPriv, targetPubkey);
        const encryptedSeal = _nip44.encrypt(JSON.stringify(signedSeal), conversationKey);

        const wrap = {
            kind: 1059,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', targetPubkey]],
            content: encryptedSeal,
            pubkey: ephemeralPub
        };

        return finalizeEvent(wrap, ephemeralPriv);
    };

    const wraps = [];
    try {
        const recipientWrap = await createWrapForTarget(recipientPubkey);
        wraps.push(recipientWrap);
    } catch (e) {
        throw e;
    }

    if (recipientPubkey !== state.userPubkey) {
        try {
            const selfWrap = await createWrapForTarget(state.userPubkey);
            wraps.push(selfWrap);
        } catch (e) { console.error(e); }
    }

    return wraps;
}

// ============================================
// 📡 RELAY DISCOVERY & HELPERS
// ============================================

export async function getRecipientInboxRelays(pubkey) {
    try {
        console.log(`📬 Fetching inbox relays for ${pubkey.substring(0, 8)}...`);
        const filter = { kinds: [10050], authors: [pubkey], limit: 1 };
        const events = await state.pool.querySync(state.currentRelays, filter);

        if (events && events.length > 0) {
            const inboxRelays = events[0].tags.filter(t => t[0] === 'relay').map(t => t[1]);
            if (inboxRelays.length > 0) return inboxRelays;
        }
        return null;
    } catch (err) {
        return null;
    }
}

export async function getUserInboxRelays() {
    try {
        const filter = { kinds: [10050], authors: [state.userPubkey], limit: 1 };
        const events = await state.pool.querySync(state.currentRelays, filter);

        if (events && events.length > 0) {
            const inboxRelays = events[0].tags.filter(t => t[0] === 'relay').map(t => t[1]);
            if (inboxRelays.length > 0) return inboxRelays;
        }
        return [];
    } catch (err) {
        return [];
    }
}

export async function testRelayConnections(relays) {
    console.log('🧪 Testing connection to', relays.length, 'relays...');
    for (const relay of relays) {
        try {
            const r = await state.pool.ensureRelay(relay);
            const isConnected = r.connected || (r.status === 1) || (r.ws && r.ws.readyState === 1);
            console.log(`🔌 Relay ${relay}: ${isConnected ? '✅' : '❌'}`);
        } catch (e) {
            console.error(`❌ Relay ${relay} failed:`, e.message);
        }
    }
}

export async function loadDMs() {
    if (state.isSyncing) return;
    state.isSyncing = true;

    const overlay = document.getElementById('initialSyncOverlay');

    const userInboxRelays = await getUserInboxRelays();
    const allRelays = [...new Set([...state.currentRelays, ...userInboxRelays])];

    const now = Math.floor(Date.now() / 1000);
    const shouldFetchHistory = state.lastSyncTimestamp === 0;

    if (!state.userPubkey) {
        state.isSyncing = false;
        return;
    }

    const syncSince = Math.max(0, state.lastSyncTimestamp - 60);

    const historicalFilters = !shouldFetchHistory ? [
        { kinds: [4, 1059], authors: [state.userPubkey], since: syncSince, limit: 1000 },
        { kinds: [4, 1059], '#p': [state.userPubkey], since: syncSince, limit: 1000 }
    ] : [
        { kinds: [4, 1059], authors: [state.userPubkey], limit: 2500 },
        { kinds: [4, 1059], '#p': [state.userPubkey], limit: 2500 }
    ];

    const realtimeSince = now - 3600;
    const realtimeFilters = [
        { kinds: [4, 1059], authors: [state.userPubkey], since: realtimeSince },
        { kinds: [4, 1059], '#p': [state.userPubkey], since: realtimeSince }
    ];

    let eventCount = 0;
    let newMessageCount = 0;
    let initialSyncComplete = false;
    let pendingOps = 0;

    const finish = () => {
        state.connectionActive = true;
        state.isSyncing = false;
        saveMessagesToCache(state.userPubkey);
        if (overlay) overlay.classList.add('hidden');
        renderConversations();
        if (state.currentChatPubkey) renderChat(state.currentChatPubkey);

        // Update timestamp logic
        if (newMessageCount > 0 && state.lastSyncTimestamp < now) {
            state.lastSyncTimestamp = now;
        }

        fetchAllProfiles();
        showStatus('Sync complete', 'success');
    };

    const checkComplete = () => {
        if (initialSyncComplete && pendingOps === 0) finish();
    };

    // Watchdogs
    setTimeout(() => { if (!initialSyncComplete) { initialSyncComplete = true; checkComplete(); } }, 5000);
    setTimeout(() => { if (overlay && !overlay.classList.contains('hidden')) finish(); }, 10000);

    testRelayConnections(state.currentRelays);

    state.pool.subscribeMany(allRelays, historicalFilters, {
        onevent: async (event) => {
            eventCount++;
            pendingOps++;
            try {
                const res = await processDM(event);
                if (res) newMessageCount++;
                if (event.created_at > state.lastSyncTimestamp) state.lastSyncTimestamp = event.created_at;
            } finally {
                pendingOps--;
                checkComplete();
            }
        },
        oneose: () => {
            initialSyncComplete = true;
            checkComplete();
        }
    });

    state.pool.subscribeMany(allRelays, realtimeFilters, {
        onevent: async (event) => {
            const wasNew = await processDM(event);
            if (wasNew) {
                renderConversations();
                if (state.currentChatPubkey) {
                    // logic to determine if current chat needs flush
                    // processDM handles renderChat if currentChatPubkey matches
                }
            }
        }
    });
}

export async function discoverRelays() {
    if (!state.userPubkey) return;
    showStatus('Searching for relays...', 'info');

    try {
        const events = await state.pool.querySync(state.currentRelays, {
            kinds: [10002, 3], authors: [state.userPubkey], limit: 2
        });

        const foundRelays = new Set();
        events.forEach(ev => {
            if (ev.kind === 10002) {
                ev.tags.forEach(t => { if (t[0] === 'r' && t[1]) foundRelays.add(t[1]); });
            } else if (ev.kind === 3) {
                try {
                    const c = JSON.parse(ev.content);
                    Object.keys(c).forEach(k => { if (k.startsWith('ws')) foundRelays.add(k); });
                } catch (e) { }
            }
        });

        const newRelays = Array.from(foundRelays).filter(r => !state.currentRelays.includes(r.endsWith('/') ? r.slice(0, -1) : r));

        if (newRelays.length > 0) {
            if (confirm(`Found ${newRelays.length} new relays. Add them and resync?`)) {
                newRelays.forEach(r => state.currentRelays.push(r));
                localStorage.setItem('user_relays', JSON.stringify(state.currentRelays));
                state.lastSyncTimestamp = 0;
                location.reload(); // Simple reload to resync
            }
        } else {
            showStatus('No new relays found', 'info');
        }

    } catch (e) { console.error(e); showStatus('Discovery failed', 'error'); }
}

export async function scanUserActivity() {
    if (!state.userPubkey) return;
    showStatus('Scanning activity...', 'info');
    try {
        const authored = await state.pool.querySync(state.currentRelays, { authors: [state.userPubkey], limit: 50 });
        const received = await state.pool.querySync(state.currentRelays, { '#p': [state.userPubkey], limit: 50 });
        const all = [...authored, ...received];
        const counts = {};
        all.forEach(ev => counts[ev.kind] = (counts[ev.kind] || 0) + 1);
        console.table(counts);
        alert(`Scan Complete. Found ${all.length} events. Check console.`);
    } catch (e) { console.error(e); }
}

export function toggleEncryptionProtocol(pubkey) {
    const prefKey = 'enc_pref_' + pubkey;
    localStorage.setItem(prefKey, next);
    updateEncryptionToggle(pubkey);
    showStatus(`Switched to ${next === 'nip17' ? 'NIP-17 (Private)' : 'NIP-04 (Legacy)'} for this chat`);
}
