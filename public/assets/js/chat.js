
    import { 
      relayInit,
      generatePrivateKey,
      getPublicKey,
      getEventHash,
      signEvent,
      nip19,
      nip04
    } from 'nostr-tools';

    // CONFIGURATION - Only need CS team's pubkey!
    const CONFIG = {
      relays: [
        'wss://relay.damus.io',
        'wss://relay.primal.net',
        'wss://nos.lol',
        'wss://relay.btcforplebs.com',
        'wss://haven.btcforplebs.com'
      ],
      csPubkey: '75462f4dece4fbde54a535cfa09eb0d329bda090a9c2f9ed6b5f9d1d2fb6c15b' // Replace with actual pubkey
    };

    // State
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

    // Generate or retrieve session key from localStorage
    function getSessionKey() {
      const stored = localStorage.getItem('nostr_chat_session');
      if (stored) {
        try {
          const session = JSON.parse(stored);
          // Reuse if less than 24 hours old
          if (Date.now() - session.created < 24 * 60 * 60 * 1000) {
            return session.privKey;
          }
        } catch (e) {}
      }
      
      // Generate new ephemeral key
      const privKey = generatePrivateKey();
      localStorage.setItem('nostr_chat_session', JSON.stringify({
        privKey,
        created: Date.now()
      }));
      return privKey;
    }

    // Initialize
    async function init() {
      // Get or create session key
      state.myPrivKey = getSessionKey();
      state.myPubKey = getPublicKey(state.myPrivKey);
      state.sessionId = state.myPubKey.substring(0, 8);
      
      console.log('🔑 Session Identity:', nip19.npubEncode(state.myPubKey));
      
      // Connect to relays
      const relayPromises = CONFIG.relays.map(async (url) => {
        try {
          const relay = relayInit(url);
          
          relay.on('connect', () => {
            console.log(`✓ Connected to ${url}`);
            checkConnection();
          });
          
          relay.on('disconnect', () => {
            console.log(`✗ Disconnected from ${url}`);
          });
          
          await relay.connect();
          return relay;
        } catch (error) {
          console.error(`Failed: ${url}:`, error);
          return null;
        }
      });
      
      state.relays = (await Promise.all(relayPromises)).filter(r => r !== null);
      
      if (state.relays.length === 0) {
        addMessage('system', '⚠️ Failed to connect to any relays');
        return;
      }
      
      console.log(`✓ Connected to ${state.relays.length}/${CONFIG.relays.length} relays`);
      
      // Subscribe to replies from CS team
      subscribeToReplies();
      
      // Load any previous messages from this session
      loadPreviousMessages();
      
      state.connected = true;
      render();
    }

    function checkConnection() {
      const connected = state.relays.some(r => r.status === 1); // 1 = connected
      state.connected = connected;
      render();
    }

    // Subscribe to DMs from CS team
    function subscribeToReplies() {
      const filters = [{
        kinds: [4],
        '#p': [state.myPubKey],
        authors: [CONFIG.csPubkey],
        since: Math.floor(Date.now() / 1000) - 86400 // Last 24 hours
      }];
      
      console.log('🔔 Subscribing to CS team replies...');

      state.relays.forEach(relay => {
        const sub = relay.sub(filters);
        
        sub.on('event', (event) => {
          handleIncomingMessage(event);
        });
        
        sub.on('eose', () => {
          console.log(`✓ Subscribed: ${relay.url}`);
        });
      });
    }

    // Load previous messages from localStorage
    function loadPreviousMessages() {
      const stored = localStorage.getItem(`nostr_chat_messages_${state.sessionId}`);
      if (stored) {
        try {
          const messages = JSON.parse(stored);
          messages.forEach(msg => state.messages.push(msg));
          render();
        } catch (e) {}
      }
    }

    // Save messages to localStorage
    function saveMessages() {
      localStorage.setItem(`nostr_chat_messages_${state.sessionId}`, JSON.stringify(state.messages));
    }

    // Handle incoming DM from CS team
    async function handleIncomingMessage(event) {
      try {
        // Check for duplicates
        if (state.messages.find(m => m.id === event.id)) {
          return;
        }
        
        console.log('📨 Received message from CS team');
        
        // Decrypt
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
        
        // Notification
        if (!document.hasFocus()) {
          document.title = '💬 New message!';
          setTimeout(() => {
            document.title = 'Nostr Support Chat';
          }, 3000);
        }
      } catch (error) {
        console.error('Error decrypting message:', error);
      }
    }

    // Send message to CS team
    async function sendMessage() {
      if (!state.inputMessage.trim()) return;

      const messageText = state.inputMessage;
      
      try {
        console.log('🔐 Encrypting and sending...');
        
        // Encrypt
        const encrypted = await nip04.encrypt(
          state.myPrivKey,
          CONFIG.csPubkey,
          messageText
        );
        
        // Create event
        let event = {
          kind: 4,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['p', CONFIG.csPubkey]],
          content: encrypted,
          pubkey: state.myPubKey
        };
        
        event.id = getEventHash(event);
        event.sig = signEvent(event, state.myPrivKey);
        
        // Publish to all relays
        let published = 0;
        for (const relay of state.relays) {
          try {
            await relay.publish(event);
            published++;
            console.log(`✓ Published to ${relay.url}`);
          } catch (err) {
            console.error(`✗ Failed: ${relay.url}:`, err);
          }
        }
        
        if (published === 0) {
          addMessage('system', '⚠️ Failed to send - no relay connections');
          return;
        }
        
        console.log(`✓ Published to ${published}/${state.relays.length} relays`);
        
        // Add to local messages
        const message = {
          id: event.id,
          text: messageText,
          sender: 'user',
          timestamp: new Date().toISOString()
        };
        
        addMessage('user', messageText, message);
        state.inputMessage = '';
        render();
        
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
        const container = document.getElementById('messages');
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

// Render function with mobile responsiveness
function render() {
  const container = document.getElementById('chat-widget-root');
  
  if (!container) return;

  if (!state.isOpen) {
    container.innerHTML = `
      <div class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[99999]">
        <button onclick="window.openChat()"
          class="bg-gradient-to-br from-[#8e30eb] to-[#a915ff] hover:from-[#a915ff] hover:to-[#8e30eb] text-white rounded-full p-4 sm:p-5 shadow-2xl transition-all transform hover:scale-110 active:scale-95"
          aria-label="Open chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sm:w-7 sm:h-7">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      </div>
    `;
    return;
  }

  // Full chat box rendering with mobile responsiveness
  container.innerHTML = `
    <div class="fixed inset-4 sm:inset-auto sm:bottom-6 sm:right-6 z-[99999]">
      <div class="bg-white rounded-2xl shadow-2xl w-full h-full sm:w-96 sm:h-[600px] max-w-full flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="bg-gradient-to-br from-[#8e30eb] to-[#a915ff] text-white p-4 sm:p-5">
          <div class="flex justify-between items-center">
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-base sm:text-lg">Instant Nostr Chat</h3>
              <div class="flex items-center gap-2 mt-1">
                <div class="w-2 h-2 rounded-full flex-shrink-0 ${state.connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}"></div>
                <span class="text-xs text-orange-100 truncate">
                  ${state.connected ? `P2P E2EE • ${state.relays.length} relays` : 'Connecting...'}
                </span>
              </div>
            </div>
            <button 
              onclick="window.closeChat()" 
              class="hover:bg-white/20 p-2 rounded-lg transition-colors ml-2 flex-shrink-0"
              aria-label="Close chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div id="messages" class="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white">
          ${state.messages.length === 0 ? `
            <div class="text-center text-gray-400 mt-8">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="mx-auto mb-3 opacity-50">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <p class="text-sm">Start a conversation</p>
            </div>
          ` : state.messages.map(msg => {
            if (msg.sender === 'system') {
              return `
                <div class="flex justify-center">
                  <div class="bg-orange-50 text-orange-700 text-xs px-3 py-2 rounded-full border border-orange-200">
                    ${escapeHtml(msg.text)}
                  </div>
                </div>
              `;
            } else if (msg.sender === 'user') {
              return `
                <div class="flex justify-end">
                  <div class="max-w-[85%] sm:max-w-xs">
                    <div class="bg-gradient-to-br from-[#8e30eb] to-[#a915ff] text-white rounded-2xl rounded-tr-sm px-3 py-2 sm:px-4 sm:py-3 shadow-md text-sm sm:text-base">
                      ${escapeHtml(msg.text)}
                    </div>
                    <div class="text-xs text-gray-400 mt-1 text-right">${formatTime(msg.timestamp)}</div>
                  </div>
                </div>
              `;
            } else if (msg.sender === 'cs') {
              return `
                <div class="flex justify-start">
                  <div class="max-w-[85%] sm:max-w-xs">
                    <div class="bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm px-3 py-2 sm:px-4 sm:py-3 shadow-md text-sm sm:text-base">
                      <div class="text-xs font-semibold text-[#8e30eb] mb-1">Loge Media Team</div>
                      ${escapeHtml(msg.text)}
                    </div>
                    <div class="text-xs text-gray-400 mt-1">${formatTime(msg.timestamp)}</div>
                  </div>
                </div>
              `;
            }
            return '';
          }).join('')}
        </div>

        <!-- Input -->
        <div class="border-t bg-white p-3 sm:p-4 safe-area-bottom">
          <div class="flex gap-2">
            <input 
              id="message-input" 
              type="text" 
              value="${escapeHtml(state.inputMessage)}" 
              placeholder="Type your message..." 
              class="flex-1 px-3 py-2 sm:px-4 sm:py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8e30eb] text-sm sm:text-base"
              ${!state.connected ? 'disabled' : ''}
            >
            <button 
              onclick="window.sendMessage()" 
              ${!state.connected || !state.inputMessage.trim() ? 'disabled' : ''} 
              class="bg-gradient-to-br from-[#8e30eb] to-[#a915ff] hover:from-[#a915ff] hover:to-[#8e30eb] disabled:from-gray-400 disabled:to-gray-400 text-white px-4 py-2 sm:px-5 sm:py-3 rounded-xl transition-all disabled:cursor-not-allowed active:scale-95 flex-shrink-0"
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
  `;

  const messageInput = document.getElementById('message-input');
  if (messageInput) {
    messageInput.addEventListener('input', (e) => {
      state.inputMessage = e.target.value;
      const sendButton = document.querySelector('button[onclick="window.sendMessage()"]');
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
    
    // Auto-scroll to bottom on mobile
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer && state.messages.length > 0) {
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 100);
    }
    
    messageInput.focus();
  }
}

// Global functions
window.openChat = async () => {
  state.isOpen = true;
  render();
  if (state.relays.length === 0) {
    await init();
  }
};

window.closeChat = () => {
  state.isOpen = false;
  render();
};

window.sendMessage = sendMessage;

// Initial render
render();
