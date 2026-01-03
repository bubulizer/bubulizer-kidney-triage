/* gpt-bridge.js — optional backend hook (no API keys in browser)
   Exposes window.KT_GPT.askViaProxy(endpoint, promptText)

   Expected proxy contract:
   POST { prompt: string, country?: string, mode?: string }
   Returns: { reply: string }
*/
(() => {
  const KT_GPT = {};

  KT_GPT.askViaProxy = async (endpoint, promptText) => {
    try{
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          prompt: promptText,
          meta: {
            country: document.getElementById("country")?.value || "NA",
            mode: document.getElementById("mode")?.value || "patient",
            brand: document.getElementById("brandSelect")?.value || "bubulizer"
          }
        })
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok){
        return data?.error || `Proxy error (${res.status}).`;
      }
      return data?.reply || "No reply returned from proxy.";
    }catch(e){
      return "Proxy call failed: " + (e?.message || String(e));
    }
  };

  window.KT_GPT = KT_GPT;
})();
