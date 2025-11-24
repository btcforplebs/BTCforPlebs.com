/**
 * Nostr Chat Widget - Embeddable Version (Glassmorphism Design)
 * 
 * EMBED IT WITH:
 * <script src="https://btcforplebs.com/nostr-chat-widget.js"
 *     data-nostr-pubkey="YOUR_PUBKEY_HEX_FORMAT"
 *     data-brand-name="My Company"
 *     data-color="#8e30eb"
 *     data-color-secondary="#ff8c00">
 * </script>
 */

(function () {
  'use strict';

  // Get configuration from script tag
  const scriptTag = document.currentScript;
  const csPubkey = scriptTag.getAttribute('data-nostr-pubkey') || 'PUBKEY_TO_RECEICE_MESSAGES';
  const brandName = scriptTag.getAttribute('data-brand-name') || 'Support Team Messaging';
  const primaryColor = scriptTag.getAttribute('data-color') || '#fdad01';
  const secondaryColor = scriptTag.getAttribute('data-color-secondary') || '#000000';

  // Default relay configuration
  const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
    'wss://relay.btcforplebs.com'
  ];

  // Add viewport meta tag for mobile optimization
  let viewportMeta = document.querySelector('meta[name="viewport"]');
  if (!viewportMeta) {
    viewportMeta = document.createElement('meta');
    viewportMeta.name = 'viewport';
    document.head.appendChild(viewportMeta);
  }
  viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

  // Inject custom styles with glassmorphism
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --nc-primary: ${primaryColor};
      --nc-secondary: ${secondaryColor};
      --nc-bg-glass: rgba(255, 255, 255, 0.08);
      --nc-bg-glass-light: rgba(255, 255, 255, 0.03);
      --nc-border-glass: rgba(255, 255, 255, 0.15);
      --nc-text-primary: #ffffff;
      --nc-text-secondary: rgba(255, 255, 255, 0.8);
      --nc-text-muted: rgba(255, 255, 255, 0.6);
    }
    .nc-root {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
    }
    .nc-root * {
      box-sizing: border-box;
    }
    .nc-launcher {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      z-index: 99999;
    }
    .nc-launcher-btn {
      background: linear-gradient(to bottom right, var(--nc-primary), var(--nc-secondary));
      color: white;
      border-radius: 9999px;
      padding: 1rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      transition: all 0.3s ease;
      transform: scale(1);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .nc-launcher-btn:hover {
      opacity: 0.9;
      transform: scale(1.1);
    }
    .nc-launcher-btn:active {
      transform: scale(0.95);
    }
    .nc-window-wrapper {
      position: fixed;
      inset: 0;
      z-index: 99999;
      pointer-events: none;
    }
    .nc-window {
      pointer-events: auto;
      background: var(--nc-bg-glass);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--nc-border-glass);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      width: 100%;
      height: 100%;
    }
    .nc-header {
      background: linear-gradient(to bottom right, var(--nc-primary), var(--nc-secondary));
      color: white;
      padding: 0.875rem 1rem;
      flex-shrink: 0;
    }
    .nc-header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .nc-header-info {
      flex: 1;
      min-width: 0;
    }
    .nc-title {
      font-weight: 700;
      font-size: 1rem;
      margin: 0;
    }
    .nc-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.125rem;
    }
    .nc-status-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 9999px;
      flex-shrink: 0;
    }
    .nc-status-dot.connected {
      background-color: #4ade80;
      animation: nc-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    .nc-status-dot.disconnected {
      background-color: #f87171;
    }
    .nc-status-text {
      font-size: 0.75rem;
      color: var(--nc-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .nc-close-btn {
      background: transparent;
      border: none;
      color: white;
      padding: 0.5rem;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: background-color 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .nc-close-btn:hover {
      background-color: rgba(255, 255, 255, 0.2);
    }
    .nc-messages {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem;
      background: var(--nc-bg-glass-light);
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
    .nc-empty-state {
      text-align: center;
      color: var(--nc-text-muted);
      margin-top: 2rem;
    }
    .nc-msg-row {
      display: flex;
      width: 100%;
    }
    .nc-msg-row.system {
      justify-content: center;
    }
    .nc-msg-row.user {
      justify-content: flex-end;
    }
    .nc-msg-row.cs {
      justify-content: flex-start;
    }
    .nc-msg-system {
      background-color: rgba(255, 237, 213, 0.4);
      backdrop-filter: blur(4px);
      color: #9a3412;
      font-size: 0.75rem;
      padding: 0.5rem 0.75rem;
      border-radius: 9999px;
      border: 1px solid rgba(253, 186, 116, 0.5);
    }
    .nc-msg-bubble-wrapper {
      max-width: 85%;
    }
    .nc-msg-bubble {
      padding: 0.5rem 0.75rem;
      border-radius: 1rem;
      color: white;
      font-size: 0.875rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      word-break: break-word;
    }
    .nc-msg-bubble.user {
      background: linear-gradient(to bottom right, var(--nc-primary), var(--nc-secondary));
      border-top-right-radius: 0.125rem;
    }
    .nc-msg-bubble.cs {
      background: linear-gradient(to bottom right, #9ca3af, #6b7280);
      border-top-left-radius: 0.125rem;
    }
    .nc-msg-time {
      font-size: 0.75rem;
      color: var(--nc-text-muted);
      margin-top: 0.25rem;
    }
    .nc-msg-time.right {
      text-align: right;
    }
    .nc-input-area {
      padding: 0.75rem;
      padding-bottom: max(env(safe-area-inset-bottom), 1.5rem);
      background: transparent;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      position: sticky;
      bottom: 0;
      z-index: 10;
    }
    .nc-input-wrapper {
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 0.75rem;
      padding: 0.5rem;
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .nc-input-wrapper:focus-within {
      background: rgba(255, 255, 255, 0.25);
      border-color: rgba(255, 255, 255, 0.4);
    }
    .nc-input-field {
      flex: 1;
      background: transparent;
      border: none;
      color: white;
      padding: 0.375rem 0.5rem;
      font-size: 0.875rem;
      outline: none;
    }
    .nc-input-field::placeholder {
      color: var(--nc-text-muted);
    }
    .nc-send-btn {
      background: linear-gradient(to bottom right, var(--nc-primary), var(--nc-secondary));
      color: white;
      border: none;
      padding: 0.5rem;
      border-radius: 0.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
    }
    .nc-send-btn:hover:not(:disabled) {
      opacity: 0.9;
    }
    .nc-send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    @keyframes nc-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Desktop Overrides */
    @media (min-width: 640px) {
      .nc-launcher {
        bottom: 1.5rem;
        right: 1.5rem;
      }
      .nc-launcher-btn {
        padding: 1.25rem;
      }
      .nc-window-wrapper {
        inset: auto;
        bottom: 1.5rem;
        right: 1.5rem;
      }
      .nc-window {
        width: 24rem;
        height: 600px;
        max-height: calc(100vh - 3rem);
        border-radius: 1rem;
      }
      .nc-header {
        padding: 1rem;
      }
      .nc-title {
        font-size: 1.125rem;
      }
      .nc-messages {
        padding: 0.875rem;
      }
      .nc-msg-bubble-wrapper {
        max-width: 20rem;
      }
      .nc-msg-bubble {
        padding: 0.75rem 1rem;
        font-size: 1rem;
      }
      .nc-input-area {
        padding: 0.875rem;
        padding-bottom: 0.875rem;
      }
      .nc-input-field {
        font-size: 1rem;
      }
    }
  `;
  document.head.appendChild(style);

  // Create widget container
  const widgetRoot = document.createElement('div');
  widgetRoot.id = 'nostr-chat-widget-root';
  document.body.appendChild(widgetRoot);

  // Import map for nostr-tools
  const importMap = document.createElement('script');
  importMap.type = 'importmap';
  importMap.textContent = JSON.stringify({
    imports: {
      'nostr-tools': 'https://esm.sh/nostr-tools@1.17.0'
    }
  });
  document.head.appendChild(importMap);

  // Main widget script
  const widgetScript = document.createElement('script');
  widgetScript.type = 'module';
  widgetScript.textContent = `
    import { 
      relayInit,
      generatePrivateKey,
      getPublicKey,
      getEventHash,
      signEvent,
      nip19,
      nip04
    } from 'nostr-tools';

    const CONFIG = {
      relays: ${JSON.stringify(DEFAULT_RELAYS)},
      csPubkey: '${csPubkey}',
      brandName: '${brandName}',
      primaryColor: '${primaryColor}',
      secondaryColor: '${secondaryColor}'
    };

    let state = {
      isOpen: false,
      messages: [],
      inputMessage: '',
      myPrivKey: null,
      myPubKey: null,
      relays: [],
      connected: false,
      sessionId: null
    };

    function getSessionKey() {
      const stored = localStorage.getItem('nostr_chat_session');
      if (stored) {
        try {
          const session = JSON.parse(stored);
          if (Date.now() - session.created < 24 * 60 * 60 * 1000) {
            return session.privKey;
          }
        } catch (e) {}
      }
      
      const privKey = generatePrivateKey();
      localStorage.setItem('nostr_chat_session', JSON.stringify({
        privKey,
        created: Date.now()
      }));
      return privKey;
    }

    async function init() {
      // Check for crypto.subtle availability (requires HTTPS)
      if (!window.crypto || !window.crypto.subtle) {
        state.connected = false;
        addMessage('system', '⚠️ Secure connection required. Please use HTTPS.');
        console.error('crypto.subtle not available. Page must be served over HTTPS.');
        render();
        return;
      }

      state.myPrivKey = getSessionKey();
      state.myPubKey = getPublicKey(state.myPrivKey);
      state.sessionId = state.myPubKey.substring(0, 8);
      
      console.log('🔑 Session Identity:', nip19.npubEncode(state.myPubKey));
      console.log('📱 User Agent:', navigator.userAgent);
      console.log('🌐 Connecting to relays...');
      
      const relayPromises = CONFIG.relays.map(async (url) => {
        try {
          console.log(\`Attempting: \${url}\`);
          const relay = relayInit(url);
          
          relay.on('connect', () => {
            console.log(\`✓ Connected to \${url}\`);
            checkConnection();
          });
          
          relay.on('disconnect', () => {
            console.log(\`✗ Disconnected from \${url}\`);
            checkConnection();
          });
          
          relay.on('error', (err) => {
            console.error(\`❌ Relay error \${url}:\`, err);
          });
          
          await relay.connect();
          return relay;
        } catch (error) {
          console.error(\`Failed: \${url}:\`, error);
          return null;
        }
      });
      
      state.relays = (await Promise.all(relayPromises)).filter(r => r !== null);
      
      console.log(\`✓ Connected to \${state.relays.length}/\${CONFIG.relays.length} relays\`);
      
      if (state.relays.length === 0) {
        addMessage('system', '⚠️ Failed to connect to any relays. Check console for details.');
        return;
      }
      
      subscribeToReplies();
      loadPreviousMessages();
      
      state.connected = true;
      render();
    }

    function checkConnection() {
      const connected = state.relays.some(r => r.status === 1);
      state.connected = connected;
      render();
    }

    function subscribeToReplies() {
      const filters = [{
        kinds: [4],
        '#p': [state.myPubKey],
        authors: [CONFIG.csPubkey],
        since: Math.floor(Date.now() / 1000) - 86400
      }];
      
      console.log('🔔 Subscribing to replies...');

      state.relays.forEach(relay => {
        const sub = relay.sub(filters);
        
        sub.on('event', (event) => {
          handleIncomingMessage(event);
        });
        
        sub.on('eose', () => {
          console.log(\`✓ Subscribed: \${relay.url}\`);
        });
      });
    }

    function loadPreviousMessages() {
      const stored = localStorage.getItem(\`nostr_chat_messages_\${state.sessionId}\`);
      if (stored) {
        try {
          const messages = JSON.parse(stored);
          messages.forEach(msg => state.messages.push(msg));
          render();
        } catch (e) {}
      }
    }

    function saveMessages() {
      localStorage.setItem(\`nostr_chat_messages_\${state.sessionId}\`, JSON.stringify(state.messages));
    }

    async function handleIncomingMessage(event) {
      try {
        if (state.messages.find(m => m.id === event.id)) {
          return;
        }
        
        console.log('📨 Received message');
        
        const decryptedText = await nip04.decrypt(
          state.myPrivKey,
          event.pubkey,
          event.content
        );
        
        const message = {
          id: event.id,
          text: decryptedText,
          sender: 'cs',
          timestamp: new Date(event.created_at * 1000).toISOString()
        };
        
        addMessage('cs', decryptedText, message);
        
        if (!document.hasFocus()) {
          const originalTitle = document.title;
          document.title = '💬 New message!';
          setTimeout(() => {
            document.title = originalTitle;
          }, 3000);
        }
      } catch (error) {
        console.error('Error decrypting message:', error);
      }
    }

    async function sendMessage() {
      if (!state.inputMessage.trim()) return;
      if (!state.connected || state.relays.length === 0) {
        addMessage('system', '⚠️ Not connected to relays. Please wait...');
        return;
      }

      const messageText = state.inputMessage;
      state.inputMessage = '';
      
      // Show message immediately (optimistic UI)
      const tempMessage = {
        id: 'temp_' + Date.now(),
        text: messageText,
        sender: 'user',
        timestamp: new Date().toISOString()
      };
      state.messages.push(tempMessage);
      render();
      scrollToBottom();
      
      try {
        console.log('🔐 Encrypting and sending...');
        
        const encrypted = await nip04.encrypt(
          state.myPrivKey,
          CONFIG.csPubkey,
          messageText
        );
        
        let event = {
          kind: 4,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['p', CONFIG.csPubkey]],
          content: encrypted,
          pubkey: state.myPubKey
        };
        
        event.id = getEventHash(event);
        event.sig = signEvent(event, state.myPrivKey);
        
        let published = 0;
        const publishPromises = state.relays.map(async (relay) => {
          try {
            await relay.publish(event);
            published++;
            console.log(\`✓ Published to \${relay.url}\`);
            return true;
          } catch (err) {
            console.error(\`✗ Failed: \${relay.url}:\`, err);
            return false;
          }
        });
        
        await Promise.all(publishPromises);
        
        if (published === 0) {
          // Remove the temp message
          const msgIndex = state.messages.findIndex(m => m.id === tempMessage.id);
          if (msgIndex !== -1) {
            state.messages.splice(msgIndex, 1);
          }
          addMessage('system', '⚠️ Failed to send - no relay connections');
          return;
        }
        
        console.log(\`✓ Published to \${published}/\${state.relays.length} relays\`);
        
        // Update temp message with real ID
        const msgIndex = state.messages.findIndex(m => m.id === tempMessage.id);
        if (msgIndex !== -1) {
          state.messages[msgIndex].id = event.id;
        }
        saveMessages();
        
      } catch (error) {
        console.error('Error sending:', error);
        // Remove the temp message on error
        const msgIndex = state.messages.findIndex(m => m.id === tempMessage.id);
        if (msgIndex !== -1) {
          state.messages.splice(msgIndex, 1);
        }
        addMessage('system', '⚠️ Failed to send: ' + error.message);
        render();
      }
    }

    function addMessage(sender, text, fullMessage = null) {
      const msg = fullMessage || {
        id: Date.now().toString(),
        text,
        sender,
        timestamp: new Date().toISOString()
      };
      
      state.messages.push(msg);
      saveMessages();
      render();
      scrollToBottom();
    }

    function scrollToBottom() {
      setTimeout(() => {
        const container = document.getElementById('nostr-messages');
        if (container) {
          // Smooth scroll on desktop, instant on mobile for better keyboard handling
          if (window.innerWidth >= 640) {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          } else {
            container.scrollTop = container.scrollHeight;
          }
        }
      }, 100);
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function formatTime(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }

    function render() {
      const container = document.getElementById('nostr-chat-widget-root');
      
      if (!container) return;

      if (!state.isOpen) {
        container.innerHTML = \`
          <div class="nc-root nc-launcher">
            <button onclick="window.NostrChat.open()"
              class="nc-launcher-btn"
              aria-label="Open chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 1.75rem; height: 1.75rem;">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </div>
        \`;
        return;
      }

      container.innerHTML = \`
        <div class="nc-root nc-window-wrapper">
          <div class="nc-window">
            <div class="nc-header">
              <div class="nc-header-content">
                <div class="nc-header-info">
                  <h3 class="nc-title">\${CONFIG.brandName}</h3>
                  <div class="nc-status">
                    <div class="nc-status-dot \${state.connected ? 'connected' : 'disconnected'}"></div>
                    <span class="nc-status-text">
                      \${state.connected ? \`Encrypted • \${state.relays.length} relays\` : 'Connecting...'}
                    </span>
                  </div>
                </div>
                <button 
                  onclick="window.NostrChat.close()" 
                  class="nc-close-btn"
                  aria-label="Close chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>

            <div id="nostr-messages" class="nc-messages">
              \${state.messages.length === 0 ? \`
                <div class="nc-empty-state">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin: 0 auto 0.75rem auto; opacity: 0.5;">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <p style="font-size: 0.875rem;">Start a conversation</p>
                </div>
              \` : state.messages.map(msg => {
                if (msg.sender === 'system') {
                  return \`
                    <div class="nc-msg-row system">
                      <div class="nc-msg-system">
                        \${escapeHtml(msg.text)}
                      </div>
                    </div>
                  \`;
                } else if (msg.sender === 'user') {
                  return \`
                    <div class="nc-msg-row user">
                      <div class="nc-msg-bubble-wrapper">
                        <div class="nc-msg-bubble user">
                          \${escapeHtml(msg.text)}
                        </div>
                        <div class="nc-msg-time right">Sent \${formatTime(msg.timestamp)}</div>
                      </div>
                    </div>
                  \`;
                } else if (msg.sender === 'cs') {
                  return \`
                    <div class="nc-msg-row cs">
                      <div class="nc-msg-bubble-wrapper">
                        <div class="nc-msg-bubble cs">
                          \${escapeHtml(msg.text)}
                        </div>
                        <div class="nc-msg-time">\${formatTime(msg.timestamp)}</div>
                      </div>
                    </div>
                  \`;
                }
                return '';
              }).join('')}
            </div>

            <div class="nc-input-area">
              <div class="nc-input-wrapper">
                <input 
                  id="nostr-message-input" 
                  type="text" 
                  value="\${escapeHtml(state.inputMessage)}" 
                  placeholder="Type your message..." 
                  class="nc-input-field"
                  \${!state.connected ? 'disabled' : ''}
                >
                <button 
                  onclick="window.NostrChat.send()" 
                  \${!state.connected || !state.inputMessage.trim() ? 'disabled' : ''} 
                  class="nc-send-btn"
                  aria-label="Send message"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      \`;

      const messageInput = document.getElementById('nostr-message-input');
      if (messageInput) {
        messageInput.addEventListener('input', (e) => {
          state.inputMessage = e.target.value;
          const sendButton = document.querySelector('button[onclick="window.NostrChat.send()"]');
          if (sendButton) {
            sendButton.disabled = !state.connected || !e.target.value.trim();
          }
        });
        messageInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        });
        
        const messagesContainer = document.getElementById('nostr-messages');
        if (messagesContainer && state.messages.length > 0) {
          setTimeout(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }, 100);
        }
        
        // Only auto-focus on desktop
        if (window.innerWidth >= 640) {
          messageInput.focus();
        }
      }
    }

    // Expose global API
    window.NostrChat = {
      open: async () => {
        state.isOpen = true;
        // Prevent body scroll on mobile
        if (window.innerWidth < 640) {
          document.documentElement.classList.add('chat-open');
          document.body.classList.add('chat-open');
        }
        render();
        if (state.relays.length === 0) {
          await init();
        }
      },
      close: () => {
        state.isOpen = false;
        // Restore body scroll on mobile
        document.documentElement.classList.remove('chat-open');
        document.body.classList.remove('chat-open');
        render();
      },
      send: sendMessage
    };

    // Initial render
    render();
  `;

  document.body.appendChild(widgetScript);
})();
