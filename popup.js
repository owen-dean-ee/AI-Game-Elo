// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const tabs = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  const closePopup = document.getElementById('closePopup');
  
  const userNameEl = document.querySelector('.user-name');
  const currentScoreEl = document.getElementById('currentScore');
  const currentRankEl = document.getElementById('currentRank');
  
  const apiKeyInput = document.getElementById('apiKey');
  const userNameInput = document.getElementById('userName');
  const memeModeToggle = document.getElementById('memeModeToggle');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const resetDataBtn = document.getElementById('resetDataBtn');
  const settingsMessage = document.getElementById('settingsMessage');
  
  const historyList = document.getElementById('historyList');

  // Load Initial Data
  let storageData = await chrome.storage.local.get(['groqApiKey', 'userName', 'currentElo', 'eloHistory', 'memeMode']);
  
  // Set defaults
  let currentElo = storageData.currentElo || 1200;
  let history = storageData.eloHistory || [];
  let memeMode = storageData.memeMode !== undefined ? storageData.memeMode : false;
  
  userNameInput.value = storageData.userName || "";
  apiKeyInput.value = storageData.groqApiKey || "";
  userNameEl.textContent = storageData.userName || "Player";
  if (memeModeToggle) memeModeToggle.checked = memeMode;

  updateUI(currentElo, history);

  // --- TAB LOGIC ---
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active classes
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Add active class
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      
      // Draw graph when score tab is active
      if (tab.dataset.tab === 'score') {
        renderGraph(history);
      }
    });
  });

  // --- CLOSE ---
  closePopup.addEventListener('click', () => {
    window.close();
  });

  // --- SETTINGS LOGIC ---
  if (memeModeToggle) {
    memeModeToggle.addEventListener('change', async (e) => {
      memeMode = e.target.checked;
      await chrome.storage.local.set({ memeMode });
      updateUI(currentElo, history);
    });
  }

  saveSettingsBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const name = userNameInput.value.trim();
    await chrome.storage.local.set({ groqApiKey: key, userName: name });
    
    userNameEl.textContent = name || "Player";
    
    settingsMessage.textContent = "Saved successfully.";
    settingsMessage.classList.remove('hidden');
    setTimeout(() => settingsMessage.classList.add('hidden'), 3000);
  });

  resetDataBtn.addEventListener('click', async () => {
    if(confirm("Are you sure you want to reset your Elo and History?")) {
      await chrome.storage.local.remove(['currentElo', 'eloHistory']);
      currentElo = 1200;
      history = [];
      updateUI(currentElo, history);
      settingsMessage.textContent = "Data reset successfully.";
      settingsMessage.classList.remove('hidden');
      setTimeout(() => settingsMessage.classList.add('hidden'), 3000);
    }
  });

  // --- BATCH LOGIC ---
  const batchBtn = document.getElementById('batchBtn');
  if (batchBtn) {
    const batchStatus = document.getElementById('batchStatus');
    const batchProgress = document.getElementById('batchProgress');

    batchBtn.addEventListener('click', async () => {
        const chatTabs = await chrome.tabs.query({ url: "*://chatgpt.com/*" });
        if (chatTabs.length === 0) {
            alert("Please open a chatgpt.com tab first so we can securely access your history!");
            return;
        }

        const data = await chrome.storage.local.get('groqApiKey');
        if(!data.groqApiKey) {
            alert("Please save your Groq API Key first.");
            return;
        }

        batchBtn.disabled = true;
        batchBtn.style.backgroundColor = '#9e9e9e';
        batchStatus.style.display = 'block';
        batchProgress.style.display = 'block';
        batchStatus.textContent = "Initializing batch analysis...";
        batchProgress.textContent = "Fetching chat history...";

        // Make sure script is injected just in case
        try {
            await chrome.scripting.executeScript({
                target: { tabId: chatTabs[0].id },
                files: ['content.js']
            });
        } catch(e) {}

        chrome.tabs.sendMessage(chatTabs[0].id, { action: "startBatchAnalysis" }, (res) => {
            if (chrome.runtime.lastError) {
                batchStatus.textContent = "Connection failed. Please refresh your ChatGPT tab and try again.";
                batchBtn.disabled = false;
                batchBtn.style.backgroundColor = '#388E3C';
            }
        });
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "batchProgressUpdate") {
            if (request.status) batchStatus.textContent = request.status;
            if (request.log) {
                batchProgress.textContent += "\n" + request.log;
                batchProgress.scrollTop = batchProgress.scrollHeight;
            }
            if (request.done) {
                batchBtn.disabled = false;
                batchBtn.style.backgroundColor = '#388E3C';
                batchBtn.textContent = "Analysis Complete";
                // Optionally update UI when done
                chrome.storage.local.get(['currentElo', 'eloHistory'], (newData) => {
                   updateUI(newData.currentElo || 1200, newData.eloHistory || []);
                });
            }
        }
    });
  }



  // --- UI & GRAPH LOGIC ---
  function getRankDetails(elo) {
    if (memeMode) {
      if (elo < 1000) return { name: 'Absolute Chud', class: 'absolute-chud', color: '#8b5a2b' };
      if (elo < 1100) return { name: 'Bottom-Feeder', class: 'bottom-feeder', color: '#cd7f32' };
      if (elo < 1200) return { name: 'Sheep', class: 'sheep', color: '#9e9e9e' };
      if (elo < 1300) return { name: 'Mid-Maxxer', class: 'mid-maxxer', color: '#e2c044' };
      if (elo < 1400) return { name: 'Goated', class: 'goated', color: '#8bc8cb' };
      if (elo < 1500) return { name: 'Cracked', class: 'cracked', color: '#9E8EE4' };
      return { name: 'Max-Maxxing', class: 'max-maxxing', color: '#E91E63' };
    } else {
      if (elo < 1000) return { name: 'Iron', class: 'absolute-chud', color: '#8b5a2b' };
      if (elo < 1100) return { name: 'Bronze', class: 'bottom-feeder', color: '#cd7f32' };
      if (elo < 1200) return { name: 'Silver', class: 'sheep', color: '#9e9e9e' };
      if (elo < 1300) return { name: 'Gold', class: 'mid-maxxer', color: '#e2c044' };
      if (elo < 1400) return { name: 'Platinum', class: 'goated', color: '#8bc8cb' };
      if (elo < 1500) return { name: 'Diamond', class: 'cracked', color: '#9E8EE4' };
      return { name: 'Master', class: 'max-maxxing', color: '#E91E63' };
    }
  }

  function updateUI(elo, hist) {
    currentScoreEl.textContent = elo;
    const rank = getRankDetails(elo);
    currentRankEl.textContent = rank.name;

    // Remove all old rank colors
    const rankClasses = ['absolute-chud', 'bottom-feeder', 'sheep', 'mid-maxxer', 'goated', 'cracked', 'max-maxxing'];
    currentScoreEl.classList.remove(...rankClasses);
    currentRankEl.classList.remove(...rankClasses);

    currentScoreEl.classList.add(rank.class);
    currentRankEl.classList.add(rank.class);

    renderHistory(hist);
    renderGraph(hist);
  }

  function renderHistory(hist) {
    historyList.innerHTML = '';
    
    if (hist.length === 0) {
      historyList.innerHTML = `<div class="history-empty">No games played yet.</div>`;
      return;
    }

    const reversed = [...hist].reverse(); // newest first
    
    reversed.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      
      let outcomeColor = item.outcome === 'Win' ? '#388E3C' : (item.outcome === 'Loss' ? '#D32F2F' : '#6B6B70');
      
      const d = new Date(item.date);
      const dateFormat = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

      el.innerHTML = `
        <div class="history-item-left">
          <div class="date">${dateFormat}</div>
          <div class="outcome" style="color: ${outcomeColor}">${item.outcome}</div>
        </div>
        <div class="history-item-right rank-color ${getRankDetails(item.elo).class}">
          ${item.elo}
        </div>
      `;
      historyList.appendChild(el);
    });
  }

  function renderGraph(hist) {
    const canvas = document.getElementById('eloGraph');
    const ctx = canvas.getContext('2d');
    
    // Setup dimensions for high DPI
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = rect.width - 32; // padding
    const height = 120;
    
    // Scale for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    ctx.clearRect(0, 0, width, height);

    if (hist.length === 0) return;

    // Get last 20
    const pointsData = hist.slice(-20).map(h => ({ elo: h.elo }));
    if (pointsData.length === 1) {
      // Just visually add the start 1200 point for better UX
      pointsData.unshift({ elo: 1200 });
    }

    const minElo = Math.min(...pointsData.map(p => p.elo));
    const maxElo = Math.max(...pointsData.map(p => p.elo));
    
    // Add buffer
    const buffer = 50;
    const yMin = Math.max(0, minElo - buffer);
    const yMax = maxElo + buffer;
    
    const rangeY = yMax - yMin;
    
    // Graph bounds padding
    const paddingX = 20;
    const paddingY = 15;
    const gWidth = width - (paddingX * 2);
    const gHeight = height - (paddingY * 2);

    // Draw Axes
    ctx.beginPath();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    // Y axis
    ctx.moveTo(paddingX, paddingY);
    ctx.lineTo(paddingX, height - paddingY);
    // X axis
    ctx.lineTo(width - paddingX, height - paddingY);
    ctx.stroke();

    // Draw X-axis Text labels
    ctx.fillStyle = '#6B6B70';
    ctx.font = '10px Inter';
    ctx.textAlign = 'left';
    ctx.fillText(pointsData.length > 1 ? `${pointsData.length - 1} ago` : 'Origin', paddingX, height);
    ctx.textAlign = 'right';
    ctx.fillText('Now', width - paddingX, height);

    // Calculate coordinates
    const points = pointsData.map((data, i) => {
      const x = paddingX + (i * (gWidth / (pointsData.length - 1 || 1)));
      const y = (height - paddingY) - (((data.elo - yMin) / rangeY) * gHeight);
      return { x, y, elo: data.elo };
    });

    // Draw straight grey lines
    ctx.beginPath();
    ctx.strokeStyle = '#A8A8A8'; // grey
    ctx.lineWidth = 2;
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Draw discrete points
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = getRankDetails(p.elo).color;
      ctx.fill();
    });
  }
});
