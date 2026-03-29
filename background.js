// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeChat") {
    handleAnalysis(request, sendResponse);
    return true; // Keep message channel open for async
  }
});

async function handleAnalysis(request, sendResponse) {
  try {
    const conversation = request.conversation;
    const chatUrl = request.chatUrl;

    // 1. Fetch the Groq API Key from storage
    const storageData = await chrome.storage.local.get(["groqApiKey", "currentElo", "eloHistory", "analyzedChats"]);
    const apiKey = storageData.groqApiKey;
    let analyzedChats = storageData.analyzedChats || {};

    if (chatUrl && analyzedChats[chatUrl]) {
      sendResponse({ success: false, error: "Already Analyzed Chat!" });
      return;
    }

    if (!apiKey) {
      sendResponse({ success: false, error: "Please set your Groq API Key in the Settings tab." });
      return;
    }

    if (!conversation || conversation.length === 0) {
      sendResponse({ success: false, error: "Empty conversation detected. Please chat first." });
      return;
    }

    // 2. Format conversation for prompt
    let formattedConvo = "";
    conversation.forEach((turn, idx) => {
      formattedConvo += `[Turn ${idx + 1}] ${turn.role}: ${turn.text}\n\n`;
    });

    const systemPrompt = `You are an expert conversational analyst. You are analyzing a conversation between a human and an AI assistant.
Your goal is to determine who is leading the interaction: the human or the AI.

Define "leading" as:
- Introducing new topics or directions
- Controlling the flow of the conversation
- Setting goals or constraints
- Driving decisions

Steps:
1. Break the conversation into turns
2. Identify who initiates each shift in direction
3. Analyze question types (open-ended vs directive)
4. Evaluate dependency (who relies on whom)

You MUST output exactly one line at the very end in the following exact format representing the final winner:
Leader: Human
OR
Leader: AI
OR 
Leader: Mixed

No other text should be output on that final line.`;

    // 3. Call Groq API (using llama-8b or llama-3.3-70b-versatile)
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // 70b is smarter for analysis
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Analyze the following conversation:\n\n" + formattedConvo }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      sendResponse({ success: false, error: `Groq API Error: ${response.status} - ${errorText}` });
      return;
    }

    const data = await response.json();
    const aiOutput = data.choices[0].message.content.trim();

    // 4. Parse the output
    let outcomeStr = null;
    let Sa = 0.5; // Default mixed

    if (aiOutput.includes("Leader: Human")) {
      outcomeStr = "Win";
      Sa = 1;
    } else if (aiOutput.includes("Leader: AI")) {
      outcomeStr = "Loss";
      Sa = 0;
    } else if (aiOutput.includes("Leader: Mixed")) {
      outcomeStr = "Mixed";
      Sa = 0.5;
    } else {
      // Fallback robust regex parsing for final line
      const match = aiOutput.match(/Leader:\s*(Human|AI|Mixed)/i);
      if (match) {
        let parsed = match[1].toLowerCase();
        if (parsed === 'human') { outcomeStr = 'Win'; Sa = 1; }
        else if (parsed === 'ai') { outcomeStr = 'Loss'; Sa = 0; }
        else { outcomeStr = 'Mixed'; Sa = 0.5; }
      } else {
        console.error("Failed to parse Groq response:", aiOutput);
        sendResponse({ success: false, error: "Failed to parse API output. It did not contain 'Leader: [Human|AI|Mixed]'." });
        return;
      }
    }

    // 5. Update Elo
    let currentElo = storageData.currentElo || 1200;

    // Ra = currentElo, Rb = Ra (playing against equal difficulty)
    // Ea = 1 / (1 + 10^0) = 0.5
    let Ea = 0.5;
    let k = 25;
    let eloDiff = Math.round(k * (Sa - Ea));
    let newElo = currentElo + eloDiff;

    let eloHistory = storageData.eloHistory || [];
    eloHistory.push({
      date: new Date().toISOString(),
      elo: newElo,
      outcome: outcomeStr,
      details: aiOutput // Keep for logging/debugging if needed
    });

    // Keep only last 100 max history to not bloat local storage
    if (eloHistory.length > 100) {
      eloHistory = eloHistory.slice(-100);
    }

    if (chatUrl) {
      analyzedChats[chatUrl] = true;
    }

    await chrome.storage.local.set({
      currentElo: newElo,
      eloHistory: eloHistory,
      analyzedChats: analyzedChats
    });

    sendResponse({
      success: true,
      data: {
        newElo,
        outcome: outcomeStr,
        eloDiff: eloDiff
      }
    });

  } catch (err) {
    console.error(err);
    sendResponse({ success: false, error: err.message });
  }
}
