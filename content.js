// content.js

function extractConversation() {
  const messageNodes = document.querySelectorAll('[data-message-author-role]');
  let conversation = [];
  
  messageNodes.forEach(node => {
    const role = node.getAttribute('data-message-author-role');
    if (role === 'user' || role === 'assistant') {
      const text = node.innerText || "";
      if (text.trim().length > 0) {
        conversation.push({ 
          role: role === 'user' ? 'Human' : 'AI', 
          text: text.substring(0, 2500).trim() 
        });
      }
    }
  });
  return conversation;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrapeChat") {
    try {
      const conversation = extractConversation();
      sendResponse({ success: true, conversation });
    } catch (e) {
      console.error("Scraping error:", e);
      sendResponse({ success: false, error: e.message });
    }
  } else if (request.action === "startBatchAnalysis") {
    sendResponse({ success: true });
    runBatchAnalysis();
  }
  return true;
});

async function runBatchAnalysis() {
  const log = (msg, done=false, status=null) => {
    chrome.runtime.sendMessage({ action: "batchProgressUpdate", log: msg, done, status });
  };

  try {
    log("Fetching /backend-api/conversations...", false, "Fetching history...");
    const res = await fetch('/backend-api/conversations?offset=0&limit=50');
    if (!res.ok) throw new Error("Failed to fetch conversation history");
    
    const data = await res.json();
    let items = data.items;
    
    if (!items || items.length === 0) {
      log("No chats found.", true, "Complete");
      return;
    }

    // Process from oldest to newest! So reverse the array (since API returns newest first)
    items.reverse();
    
    log(`Found ${items.length} chats. Starting sequential analysis...`, false, "Analyzing...");

    for (let i = 0; i < items.length; i++) {
      const chatInfo = items[i];
      const chatId = chatInfo.id;
      const chatUrl = `/c/${chatId}`;
      const title = chatInfo.title || "Untitled";
      
      log(`\n[${i+1}/${items.length}] Checking: ${title} (${chatUrl})`);

      // 1. Fetch convo JSON
      const cRes = await fetch(`/backend-api/conversation/${chatId}`);
      if (!cRes.ok) {
        log(`Failed to fetch chat contents. Skipping.`);
        continue;
      }
      
      const cData = await cRes.json();
      let conversation = [];
      
      if (cData.mapping) {
        let nodes = Object.values(cData.mapping);
        // Sort by create_time
        nodes.sort((a,b) => {
          let ta = a.message?.create_time || 0;
          let tb = b.message?.create_time || 0;
          return ta - tb;
        });

        for (let node of nodes) {
          if (!node.message) continue;
          let role = node.message.author?.role;
          if (role === 'user' || role === 'assistant') {
            let parts = node.message.content?.parts;
            if (parts && parts.length > 0) {
              let text = (typeof parts[0] === 'string') ? parts[0] : JSON.stringify(parts[0]);
              if (text && text.trim().length > 0) {
                conversation.push({ role: role === 'user' ? 'Human' : 'AI', text: text.substring(0,2500).trim() });
              }
            }
          }
        }
      }

      if (conversation.length === 0) {
        log(`Empty chat. Skipping.`);
        continue;
      }

      // 2. Transmit to background
      let analyzed = false;
      while (!analyzed) {
        const bgRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "analyzeChat", conversation, chatUrl, batch: true }, resolve);
        });

        if (!bgRes || !bgRes.success) {
          if (bgRes && bgRes.error === "Already Analyzed Chat!") {
            log(`Already analyzed! Skipping.`);
            analyzed = true;
          } else if (bgRes && bgRes.error && bgRes.error.includes("429")) {
            log(`Rate limit reached (429)! Waiting 5 seconds then retrying...`);
            await new Promise(r => setTimeout(r, 6000));
            // Let loop retry this exact chat over again
          } else {
            log(`Error: ${bgRes ? bgRes.error : 'Unknown'}`);
            analyzed = true; // Skip on unrecoverable error
          }
        } else {
          // Success!
          log(`Success: ${bgRes.data.outcome} (${bgRes.data.eloDiff > 0 ? '+' : ''}${bgRes.data.eloDiff} Elo)`);
          analyzed = true;
          // Small buffer to respect normal rate limits
          await new Promise(r => setTimeout(r, 1000)); 
        }
      }
    }

    log(`Batch complete!`, true, "Done!");

  } catch(err) {
    log(`Fatal Error: ${err.message}`, true, "Error");
  }
}


// Inject Floating Button
function injectAnalyzeButton() {
  if (document.getElementById('ai-game-elo-btn')) return; // already injected

  const btn = document.createElement('button');
  btn.id = 'ai-game-elo-btn';
  btn.innerText = 'Analyze Chat ELO';
  
  // Styling
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '80px', // slightly higher to avoid ChatGPT's input bar mechanics if they overlap
    right: '24px',
    zIndex: '99999',
    backgroundColor: '#2C2C2E',
    color: '#FFF',
    border: 'none',
    borderRadius: '8px',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    fontFamily: '"Inter", -apple-system, sans-serif',
    transition: 'all 0.2s ease',
    opacity: '0.9'
  });

  btn.onmouseover = () => { btn.style.backgroundColor = '#000'; btn.style.opacity = '1'; };
  btn.onmouseout = () => { btn.style.backgroundColor = '#2C2C2E'; btn.style.opacity = '0.9'; };

  btn.addEventListener('click', handleAnalyzeClick);
  
  document.body.appendChild(btn);
}

function resetBtn(btn, text) {
  btn.innerText = text;
  btn.disabled = false;
  btn.style.opacity = '0.9';
}

async function handleAnalyzeClick(e) {
  const btn = e.target;
  const originalText = 'Analyze Chat ELO';
  btn.innerText = 'Analyzing...';
  btn.disabled = true;
  btn.style.opacity = '1';

  try {
    const conversation = extractConversation();

    if (conversation.length === 0) {
      btn.innerText = "No Chat Found!";
      setTimeout(() => resetBtn(btn, originalText), 3000);
      return;
    }

    const chatUrl = window.location.pathname;

    if (chatUrl === '/') {
      btn.innerText = "Please refresh/save chat!";
      setTimeout(() => resetBtn(btn, originalText), 3000);
      return;
    }

    chrome.runtime.sendMessage({ action: "analyzeChat", conversation, chatUrl }, (response) => {
      if (chrome.runtime.lastError) {
        btn.innerText = "Connection Error";
        setTimeout(() => resetBtn(btn, originalText), 3000);
        return;
      }
      if (!response || !response.success) {
        btn.innerText = response ? (response.error || "API Error") : "Unknown Error";
        if (response && response.error === "Already Analyzed Chat!") {
          console.log("AI Game Elo:", response.error); // friendly log
        } else {
          console.error("Groq Analysis Error:", response ? response.error : "Unknown");
        }
        setTimeout(() => resetBtn(btn, originalText), 3000);
        return;
      }

      // Success Display based on outcome
      const outcome = response.data.outcome;
      const eloDiff = response.data.eloDiff;
      
      if (outcome === 'Win') {
        btn.innerText = `Win +${Math.abs(eloDiff)} Elo!`;
        btn.style.backgroundColor = '#388E3C'; // green success
      } else if (outcome === 'Loss') {
        btn.innerText = `Loss -${Math.abs(eloDiff)} Elo :(`;
        btn.style.backgroundColor = '#D32F2F'; // red loss
      } else {
        btn.innerText = `Mixed +${Math.abs(eloDiff)} Elo`;
        btn.style.backgroundColor = '#FBC02D'; // yellow mixed
      }

      // Revert back after 5 seconds
      setTimeout(() => {
        btn.style.backgroundColor = '#2C2C2E';
        resetBtn(btn, originalText);
      }, 5000);
    });

  } catch (err) {
    btn.innerText = "Error Parsing";
    setTimeout(() => resetBtn(btn, originalText), 3000);
  }
}

// Check every 2 seconds to ensure the button stays injected even if SPA re-renders body
setInterval(injectAnalyzeButton, 2000);
