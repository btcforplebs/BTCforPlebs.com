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

(function() {
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
    viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    document.head.appendChild(viewportMeta);
  }


  // Inject custom styles with glassmorphism
  const style = document.createElement('style');
  style.textContent = `
    .safe-area-bottom {
      padding-bottom: env(safe-area-inset-bottom);
    }
    #nostr-chat-widget-root > div {
      pointer-events: auto !important;
      z-index: 99999 !important;
    }
    .glass-morphism {
      background: rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .glass-morphism-light {
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .glass-input {
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    .glass-input:focus {
      background: rgba(255, 255, 255, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.4);
    }
    .glass-input::placeholder {
      color: rgba(255, 255, 255, 0.6);
    }
    @media (max-width: 640px) {
      #nostr-chat-widget-root .chat-window-mobile {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-height: 100vh !important;
        border-radius: 0 !important;
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
      state.myPrivKey = getSessionKey();
      state.myPubKey = getPublicKey(state.myPrivKey);
      state.sessionId = state.myPubKey.substring(0, 8);
      
      console.log('🔑 Session Identity:', nip19.npubEncode(state.myPubKey));
      
      const relayPromises = CONFIG.relays.map(async (url) => {
        try {
          const relay = relayInit(url);
          
          relay.on('connect', () => {
            console.log(\`✓ Connected to \${url}\`);
            checkConnection();
          });
          
          relay.on('disconnect', () => {
            console.log(\`✗ Disconnected from \${url}\`);
          });
          
          await relay.connect();
          return relay;
        } catch (error) {
          console.error(\`Failed: \${url}:\`, error);
          return null;
        }
      });
      
      state.relays = (await Promise.all(relayPromises)).filter(r => r !== null);
      
      if (state.relays.length === 0) {
        addMessage('system', '⚠️ Failed to connect to any relays');
        return;
      }
      
      console.log(\`✓ Connected to \${state.relays.length}/\${CONFIG.relays.length} relays\`);
      
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
        for (const relay of state.relays) {
          try {
            await relay.publish(event);
            published++;
            console.log(\`✓ Published to \${relay.url}\`);
          } catch (err) {
            console.error(\`✗ Failed: \${relay.url}:\`, err);
          }
        }
        
        if (published === 0) {
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
        addMessage('system', '⚠️ Failed to send message');
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
          container.scrollTop = container.scrollHeight;
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
          <div class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[99999]">
            <button onclick="window.NostrChat.open()"
              style="background: linear-gradient(to bottom right, \${CONFIG.primaryColor}, \${CONFIG.secondaryColor});"
              class="hover:opacity-90 text-white rounded-full p-4 sm:p-5 shadow-2xl transition-all transform hover:scale-110 active:scale-95"
              aria-label="Open chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sm:w-7 sm:h-7">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </div>
        \`;
        return;
      }

      container.innerHTML = \`
        <div class="fixed inset-0 sm:inset-auto sm:bottom-6 sm:right-6 z-[99999]">
          <div class="glass-morphism chat-window-mobile rounded-none sm:rounded-2xl shadow-2xl w-full h-full sm:w-96 sm:h-[600px] max-w-full flex flex-col overflow-hidden">
</div>
<div style="background: linear-gradient(to bottom right, ${CONFIG.primaryColor}, ${CONFIG.secondaryColor});" class="text-white py-4 px-5 sm:px-6 rounded-t-2xl">
  <div class="flex items-center justify-between">
    <div class="flex items-center space-x-2">
      <img src="/assets/logo.svg" alt="logo" class="h-5 w-5 sm:h-6 sm:w-6 rounded" />
      <h3 class="font-semibold text-sm sm:text-base">${CONFIG.brandName}</h3>
    </div>
    <button onclick="window.NostrChat.close()" class="p-2 hover:bg-white/20 rounded-md transition-colors">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
  <div style="background: linear-gradient(to bottom right, ${CONFIG.primaryColor}, ${CONFIG.secondaryColor});" class="text-white rounded-2xl rounded-tr-sm px-3 py-2 sm:px-4 sm:py-3 shadow-md text-sm sm:text-base">
    ${escapeHtml(msg.text)}
  </div>
                <div class="text-center text-white/60 mt-8">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mx-auto mb-3 opacity-50">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <p class="text-sm">Start a conversation</p>
                </div>
              \` : state.messages.map(msg => {
                if (msg.sender === 'system') {
                  return \`
                    <div class="flex justify-center">
                      <div class="bg-orange-100/40 backdrop-blur-sm text-orange-800 text-xs px-3 py-2 rounded-full border border-orange-300/50">
                        \${escapeHtml(msg.text)}
                      </div>
                    </div>
                  \`;
                } else if (msg.sender === 'user') {
                  return \`
                    <div class="flex justify-end">
                      <div class="max-w-[85%] sm:max-w-xs">
                        <div style="background: linear-gradient(to bottom right, \${CONFIG.primaryColor}, \${CONFIG.secondaryColor});" class="text-white rounded-2xl rounded-tr-sm px-3 py-2 sm:px-4 sm:py-3 shadow-md text-sm sm:text-base">
                          \${escapeHtml(msg.text)}
                        </div>
                        <div class="text-xs text-white/60 mt-1 text-right">Sent \${formatTime(msg.timestamp)}</div>
                      </div>
                    </div>
                  \`;
                } else if (msg.sender === 'cs') {
                  return \`
                    <div class="flex justify-start">
                      <div class="max-w-[85%] sm:max-w-xs">
                        <div style="background: linear-gradient(to bottom right, #9ca3af, #6b7280);" class="text-white rounded-2xl rounded-tl-sm px-3 py-2 sm:px-4 sm:py-3 shadow-md text-sm sm:text-base">
                          \${escapeHtml(msg.text)}
                        </div>
                        <div class="text-xs text-white/60 mt-1">\${formatTime(msg.timestamp)}</div>
                      </div>
                    </div>
                  \`;
                }
                return '';
              }).join('')}
            </div>

            <div class="p-3 sm:p-3.5 mb-2 flex-shrink-0 safe-area-bottom">
              <div class="glass-input rounded-xl p-2 flex gap-2 items-center">
                <input 
                  id="nostr-message-input" 
                  type="text" 
                  value="\${escapeHtml(state.inputMessage)}" 
                  placeholder="Type your message..." 
                  class="flex-1 bg-transparent px-2 py-1.5 focus:outline-none text-sm sm:text-base text-white placeholder-white/60"
                  \${!state.connected ? 'disabled' : ''}
                >
                <button 
                  onclick="window.NostrChat.send()" 
                  \${!state.connected || !state.inputMessage.trim() ? 'disabled' : ''} 
                  style="background: linear-gradient(to bottom right, \${CONFIG.primaryColor}, \${CONFIG.secondaryColor});"
                  class="hover:opacity-90 disabled:opacity-40 text-white p-2 rounded-lg transition-all disabled:cursor-not-allowed active:scale-95 flex-shrink-0"
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
        
        messageInput.focus();
      }
    }

    // Expose global API
    window.NostrChat = {
      open: async () => {
        state.isOpen = true;
        render();
        if (state.relays.length === 0) {
          await init();
        }
      },
      close: () => {
        state.isOpen = false;
        render();
      },
      send: sendMessage
    };

    // Initial render
    render();
  `;
  
  document.body.appendChild(widgetScript);
})();
