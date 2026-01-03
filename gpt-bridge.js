// gpt-bridge.js — optional backend hook (no API keys in browser)
// Expect a backend endpoint that accepts { text } and returns { reply }.

export async function askGPT(proxyUrl, summaryText){
  const res = await fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: summaryText })
  });
  if (!res.ok){
    const msg = await safeText(res);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  const data = await res.json();
  return data.reply || data.message || JSON.stringify(data, null, 2);
}

async function safeText(res){
  try { return await res.text(); } catch { return ""; }
}

/*
FASTAPI proxy + Node proxy examples can be added here if you want (production-grade).
*/
