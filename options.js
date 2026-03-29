// options.js

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('apiKey');
    const userNameInput = document.getElementById('userName');
    const saveBtn = document.getElementById('saveBtn');
    const statusMsg = document.getElementById('statusMsg');

    // Load existing settings
    const storageData = await chrome.storage.local.get(['groqApiKey', 'userName']);
    
    if (storageData.groqApiKey) {
        apiKeyInput.value = storageData.groqApiKey;
    }
    if (storageData.userName) {
        userNameInput.value = storageData.userName;
    }

    // Save logic
    saveBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        const name = userNameInput.value.trim();

        await chrome.storage.local.set({
            groqApiKey: key,
            userName: name
        });

        // Show success message briefly
        statusMsg.style.display = 'block';
        setTimeout(() => {
            statusMsg.style.display = 'none';
        }, 3000);
    });

    // --- BATCH LOGIC ---
    const batchBtn = document.getElementById('batchBtn');
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
            }
        }
    });

});
