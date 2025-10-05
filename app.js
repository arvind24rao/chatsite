// Application Configuration
const CONFIG = {
  // Call the Render API directly (Netlify proxy not required)
  baseURL: "https://loop-f3oe.onrender.com",

  original_demo: {
    thread_id: "b01164e6-c719-4fb1-b2d0-85755e7ebf38",
    user_a: "b8d99c3c-0d3a-4773-a324-a6bc60dee64e",
    user_b: "0dd8b495-6a25-440d-a6e4-d8b7a77bc688",
    bot: "b59042b5-9cee-4c20-ad5d-8a0ad42cb374"
  },

  aivl: {
    thread_id: "86fe2f0e-a4ac-4ef7-a283-a24fe735d49b",
    // Dedicated AIVL bot:
    bot_id: "c9cf9661-346c-4f9d-a549-66137f29d87e",

    // USE PROFILE IDS (from your table's profile_id column)
    users: {
      "Denis":  "2f5cf6cc-3744-49b6-bf9b-7bd2f1ac8fdb",
      "Ravin":  "830800a2-5072-45a3-b3f3-0cf407251584",
      "Kanags": "21520d4c-3c62-46d1-b056-636ca91481a2",
      "Yanan":  "700cf32f-8f98-41f9-8617-43b52f0581e4",
      "Jason":  "ab32f236-a990-4586-a4b6-d32eddcfa754",
      "Arvind": "3c421916-4f3e-49cd-8458-223e85d6bd1d"
    }
  }
};

// Application State
let currentPage = 'home';
let currentAIVLUser = null;
let isLoading = false;

// DOM Elements
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
  initializeNavigation();
  initializeDemoHandlers();
  initializeAIVLHandlers();
  initializeMobileToggle();
});

// Navigation Functions
function initializeNavigation() {
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetPage = this.getAttribute('data-page');
      navigateToPage(targetPage);
    });
  });
}

function navigateToPage(pageName) {
  // Update active nav link
  navLinks.forEach(link => link.classList.remove('active'));
  document.querySelector(`[data-page="${pageName}"]`).classList.add('active');

  // Update active page
  pages.forEach(page => page.classList.remove('active'));
  document.getElementById(`${pageName}-page`).classList.add('active');

  // Reset AIVL state when navigating away from AIVL page
  if (currentPage === 'aivl' && pageName !== 'aivl') {
    resetAIVLState();
  }

  // Reset AIVL to user selection when navigating to AIVL page
  if (pageName === 'aivl') {
    showUserSelection();
  }

  currentPage = pageName;

  // Close mobile sidebar
  sidebar.classList.remove('open');
}

function initializeMobileToggle() {
  sidebarToggle.addEventListener('click', function() {
    sidebar.classList.toggle('open');
  });

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', function(e) {
    if (window.innerWidth <= 768 &&
        !sidebar.contains(e.target) &&
        !sidebarToggle.contains(e.target) &&
        sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
    }
  });
}

// Demo Page Functions
function initializeDemoHandlers() {
  // Send button handlers
  document.querySelectorAll('.send-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const userType = this.getAttribute('data-user');
      if (userType && ['user_a', 'user_b', 'bot'].includes(userType)) {
        sendDemoMessage(userType);
      }
    });
  });

  // Refresh button handlers
  document.querySelectorAll('.refresh-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const userType = this.getAttribute('data-user');
      if (userType && ['user_a', 'user_b', 'bot'].includes(userType)) {
        refreshDemoMessages(userType);
      }
    });
  });

  // Enter key handlers for demo inputs
  document.querySelectorAll('.chat-input').forEach(input => {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const container = this.closest('.demo-panel');
        if (container) {
          const sendBtn = container.querySelector('.send-btn');
          if (sendBtn) sendBtn.click();
        }
      }
    });
  });
}

async function sendDemoMessage(userType) {
  const inputId = `${userType.replace('_', '-')}-input`;
  const input = document.getElementById(inputId);
  const message = input.value.trim();

  if (!message) {
    showToast('Please enter a message');
    return;
  }

  if (isLoading) return;

  const userId = CONFIG.original_demo[userType];
  const threadId = CONFIG.original_demo.thread_id;

  try {
    setLoading(true);

    const response = await fetch(`${CONFIG.baseURL}/api/send_message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'cors',
      body: JSON.stringify({
        thread_id: threadId,
        user_id: userId,
        content: message
      })
    });

    if (response.ok) {
      input.value = '';
      showToast('Message sent!');
      setTimeout(() => refreshDemoMessages(userType), 500);
    } else {
      const err = await safeJson(response);
      throw new Error(err?.detail || 'Failed to send message');
    }
  } catch (error) {
    console.error('Error sending message:', error);
    showToast(error.message || 'Error sending message');
  } finally {
    setLoading(false);
  }
}

async function refreshDemoMessages(userType) {
  const userId = CONFIG.original_demo[userType];
  const threadId = CONFIG.original_demo.thread_id;
  const messagesContainer = document.getElementById(`${userType.replace('_', '-')}-messages`);

  try {
    setLoading(true);

    const response = await fetch(`${CONFIG.baseURL}/api/get_messages?thread_id=${threadId}&user_id=${userId}`, {
      mode: 'cors'
    });

    if (response.ok) {
      const data = await response.json();
      displayMessages(messagesContainer, data.messages || [], userId);
    } else {
      const err = await safeJson(response);
      throw new Error(err?.detail || 'Failed to fetch messages');
    }
  } catch (error) {
    console.error('Error fetching messages:', error);
    showToast(error.message || 'Error loading messages');
  } finally {
    setLoading(false);
  }
}

// AIVL Sample Functions
function initializeAIVLHandlers() {
  // User tile selection
  document.querySelectorAll('.user-tile').forEach(tile => {
    tile.addEventListener('click', function() {
      const userName = this.getAttribute('data-user');
      selectAIVLUser(userName);
    });
  });

  // Back button
  document.querySelector('.back-btn').addEventListener('click', function() {
    showUserSelection();
  });

  // AIVL send button
  document.getElementById('aivl-send').addEventListener('click', function() {
    sendAIVLMessage();
  });

  // AIVL refresh button
  document.getElementById('aivl-refresh').addEventListener('click', function() {
    refreshAIVLMessages();
  });

  // Enter key for AIVL input
  document.getElementById('aivl-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAIVLMessage();
    }
  });
}

function selectAIVLUser(userName) {
  currentAIVLUser = userName;
  // Display "AIVL Sample" as the conversation title instead of individual username
  document.getElementById('current-user-name').textContent = 'AIVL Sample';

  // Hide user selection, show chat
  document.getElementById('user-selection').classList.add('hidden');
  document.getElementById('user-chat').classList.remove('hidden');

  // Clear any existing messages and reset input
  const messagesContainer = document.getElementById('aivl-messages');
  messagesContainer.innerHTML = '';
  document.getElementById('aivl-input').value = '';

  // Load initial messages
  refreshAIVLMessages();
}

function showUserSelection() {
  // Reset current user
  currentAIVLUser = null;

  // Clear chat data
  const messagesContainer = document.getElementById('aivl-messages');
  const input = document.getElementById('aivl-input');
  if (messagesContainer) messagesContainer.innerHTML = '';
  if (input) input.value = '';

  // Show user selection, hide chat
  document.getElementById('user-selection').classList.remove('hidden');
  document.getElementById('user-chat').classList.add('hidden');

  // Ensure no loading states are active
  setLoading(false);
}

function resetAIVLState() {
  currentAIVLUser = null;

  // Clear all AIVL-related content
  const messagesContainer = document.getElementById('aivl-messages');
  const input = document.getElementById('aivl-input');

  if (messagesContainer) messagesContainer.innerHTML = '';
  if (input) input.value = '';

  // Reset to user selection view
  const userSelection = document.getElementById('user-selection');
  const userChat = document.getElementById('user-chat');

  if (userSelection) userSelection.classList.remove('hidden');
  if (userChat) userChat.classList.add('hidden');

  // Clear any loading states
  setLoading(false);
}

async function sendAIVLMessage() {
  if (!currentAIVLUser) return;

  const input = document.getElementById('aivl-input');
  const message = input.value.trim();

  if (!message) {
    showToast('Please enter a message');
    return;
  }

  if (isLoading) return;

  const userId = CONFIG.aivl.users[currentAIVLUser];
  const threadId = CONFIG.aivl.thread_id;

  try {
    setLoading(true);

    const response = await fetch(`${CONFIG.baseURL}/api/send_message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'cors',
      body: JSON.stringify({
        thread_id: threadId,
        user_id: userId,
        content: message
      })
    });

    if (response.ok) {
      input.value = '';
      showToast('Message sent!');
      setTimeout(() => refreshAIVLMessages(), 500);
    } else {
      const err = await safeJson(response);
      throw new Error(err?.detail || 'Failed to send message');
    }
  } catch (error) {
    console.error('Error sending message:', error);
    showToast(error.message || 'Error sending message');
  } finally {
    setLoading(false);
  }
}

async function refreshAIVLMessages() {
  if (!currentAIVLUser) return;

  const userId = CONFIG.aivl.users[currentAIVLUser];
  const threadId = CONFIG.aivl.thread_id;
  const messagesContainer = document.getElementById('aivl-messages');

  try {
    setLoading(true);

    const response = await fetch(`${CONFIG.baseURL}/api/get_messages?thread_id=${threadId}&user_id=${userId}`, {
      mode: 'cors'
    });

    if (response.ok) {
      const data = await response.json();
      displayMessages(messagesContainer, data.messages || [], userId);
    } else {
      const err = await safeJson(response);
      throw new Error(err?.detail || 'Failed to fetch messages');
    }
  } catch (error) {
    console.error('Error fetching messages:', error);
    showToast(error.message || 'Error loading messages');
  } finally {
    setLoading(false);
  }
}

// Message Display Functions
function displayMessages(container, messages, currentUserId) {
  container.innerHTML = '';

  if (messages.length === 0) {
    container.innerHTML = '<div class="no-messages">No messages yet. Start the conversation!</div>';
    return;
  }

  messages.forEach(msg => {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    // Determine message type
    if (msg.user_id === currentUserId) {
      messageDiv.classList.add('user');
    } else if (msg.user_id === CONFIG.original_demo.bot || msg.user_id === CONFIG.aivl.bot_id) {
      messageDiv.classList.add('bot');
    } else {
      messageDiv.classList.add('other-user');
    }

    // Format timestamp if available
    let timestampText = '';
    if (msg.timestamp) {
      const date = new Date(msg.timestamp);
      timestampText = date.toLocaleTimeString();
    }

    messageDiv.innerHTML = `
      <div class="message-content">${escapeHtml(msg.content)}</div>
      ${timestampText ? `<div class="message-time">${timestampText}</div>` : ''}
    `;

    container.appendChild(messageDiv);
  });

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// Utility Functions
function showToast(message, duration = 3000) {
  toastMessage.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, duration);
}

function setLoading(loading) {
  isLoading = loading;
  const buttons = document.querySelectorAll('.send-btn, .refresh-btn');
  buttons.forEach(btn => {
    if (loading) {
      btn.classList.add('loading');
      btn.disabled = true;
    } else {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

// Handle window resize for responsive behavior
window.addEventListener('resize', function() {
  if (window.innerWidth > 768) {
    sidebar.classList.remove('open');
  }
});