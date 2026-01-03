/* timeline.js — encrypted local storage + timeline CRUD (offline)
   Exposes window.KT_TIMELINE with:
   - init({listEl})
   - addPoint(point)
   - getAll()
   - render()
   - exportJSON()
   - importJSON()
   - clear()
   - saveEncryptedForm(pass, formObj)
   - loadEncryptedForm(pass)
   - fillForm(formObj)
   - clearEncrypted()
*/
(() => {
  const KT_TIMELINE = {};
  const TL_KEY = "kt_timeline_v1";
  const ENC_FORM_KEY = "kt_form_enc_v1";

  let listEl = null;

  // ---------- storage ----------
  function loadTimeline(){
    try{
      const raw = localStorage.getItem(TL_KEY);
      if(!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }catch{ return []; }
  }
  function saveTimeline(arr){
    localStorage.setItem(TL_KEY, JSON.stringify(arr.slice(-250)));
  }

  // ---------- crypto helpers ----------
  function b64encode(bytes){
    let bin = "";
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }
  function b64decode(b64){
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function deriveAesKey(passphrase, saltBytes){
    if(!passphrase || passphrase.length < 6) throw new Error("Passphrase too short (min 6 chars).");
    const passBytes = new TextEncoder().encode(passphrase);
    const keyMaterial = await crypto.subtle.importKey("raw", passBytes, "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name:"PBKDF2", salt: saltBytes, iterations:150000, hash:"SHA-256" },
      keyMaterial,
      { name:"AES-GCM", length:256 },
      false,
      ["encrypt","decrypt"]
    );
  }
  async function encryptToLocalStorage(storageKey, passphrase, obj){
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(passphrase, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(obj));
    const cipherbuf = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, plaintext);
    const cipher = new Uint8Array(cipherbuf);
    localStorage.setItem(storageKey, JSON.stringify({
      v:1, salt:b64encode(salt), iv:b64encode(iv), cipher:b64encode(cipher)
    }));
  }
  async function decryptFromLocalStorage(storageKey, passphrase){
    const raw = localStorage.getItem(storageKey);
    if(!raw) return null;
    const payload = JSON.parse(raw);
    const salt = b64decode(payload.salt);
    const iv = b64decode(payload.iv);
    const cipher = b64decode(payload.cipher);
    const key = await deriveAesKey(passphrase, salt);
    const plainbuf = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plainbuf));
  }

  // ---------- timeline CRUD ----------
  KT_TIMELINE.init = ({ listEl: el }) => {
    listEl = el;
    KT_TIMELINE.render();
  };

  KT_TIMELINE.addPoint = (point) => {
    const arr = loadTimeline();
    arr.push(point);
    saveTimeline(arr);
    KT_TIMELINE.render();
  };

  KT_TIMELINE.getAll = () => loadTimeline();

  KT_TIMELINE.clear = () => {
    localStorage.removeItem(TL_KEY);
    KT_TIMELINE.render();
    if(window.KT_CHARTS) window.KT_CHARTS.renderFromTimeline([]);
  };

  function fmtDate(ts){
    try{ return new Date(ts).toLocaleString(); }catch{ return ts || ""; }
  }
  function fmt(n){ return Number.isFinite(n) ? String(n) : "NA"; }

  KT_TIMELINE.render = () => {
    if(!listEl) return;
    const arr = loadTimeline().slice().sort((a,b) => (b.ts||"").localeCompare(a.ts||""));
    listEl.innerHTML = "";
    if(!arr.length){
      listEl.innerHTML = '<div class="tiny muted">No timeline points yet. Save a point from the Triage tab.</div>';
      return;
    }
    arr.forEach((p, idx) => {
      const div = document.createElement("div");
      div.className = "tItem";
      div.innerHTML = `
        <div class="tItemTop">
          <div>
            <div><b>${fmtDate(p.ts)}</b> <span class="tItemMeta">(${p.country || "—"} • ${p.mode || "—"})</span></div>
            <div class="tItemMeta">eGFR ${fmt(p.egfr)} • Cr ${fmt(p.creat)} • CRP ${fmt(p.crp)} • Risk ${fmt(p.risk)}/20</div>
          </div>
          <div class="tItemBtns noPrint">
            <button class="smallBtn" data-act="plot" data-idx="${idx}">Plot</button>
            <button class="smallBtn danger" data-act="del" data-idx="${idx}">Delete</button>
          </div>
        </div>
        ${p.notes ? `<div class="tiny" style="margin-top:8px;">Notes: ${escapeHtml(p.notes)}</div>` : ""}
      `;
      listEl.appendChild(div);
    });

    listEl.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        const i = Number(btn.dataset.idx);
        const points = loadTimeline().slice().sort((a,b) => (b.ts||"").localeCompare(a.ts||""));
        const p = points[i];
        if(act === "plot"){
          if(window.KT_CHARTS) window.KT_CHARTS.renderFromTimeline(points.slice().reverse());
          return;
        }
        if(act === "del"){
          if(!confirm("Delete this timeline point?")) return;
          points.splice(i,1);
          saveTimeline(points.slice().reverse()); // keep chronological in storage
          KT_TIMELINE.render();
          if(window.KT_CHARTS) window.KT_CHARTS.renderFromTimeline(loadTimeline());
        }
      });
    });
  };

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }

  // ---------- import/export ----------
  KT_TIMELINE.exportJSON = () => {
    const data = loadTimeline();
    const blob = new Blob([JSON.stringify({ v:1, exportedAt:new Date().toISOString(), data }, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kidney-triage-timeline.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  KT_TIMELINE.importJSON = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if(!f) return;
      const txt = await f.text();
      try{
        const obj = JSON.parse(txt);
        const arr = Array.isArray(obj.data) ? obj.data : [];
        const merged = loadTimeline().concat(arr).slice(-250);
        // de-dupe by ts
        const seen = new Set();
        const dedup = [];
        for(const p of merged){
          const key = p.ts + "|" + (p.egfr ?? "") + "|" + (p.creat ?? "");
          if(seen.has(key)) continue;
          seen.add(key);
          dedup.push(p);
        }
        saveTimeline(dedup);
        KT_TIMELINE.render();
        if(window.KT_CHARTS) window.KT_CHARTS.renderFromTimeline(loadTimeline());
        alert("Timeline imported.");
      }catch{
        alert("Import failed: invalid JSON.");
      }
    };
    inp.click();
  };

  // ---------- encrypted form save/load ----------
  KT_TIMELINE.saveEncryptedForm = async (passphrase, formObj) => {
    await encryptToLocalStorage(ENC_FORM_KEY, passphrase, { v:1, savedAt:new Date().toISOString(), form: formObj });
  };
  KT_TIMELINE.loadEncryptedForm = async (passphrase) => {
    const obj = await decryptFromLocalStorage(ENC_FORM_KEY, passphrase);
    return obj?.form || null;
  };
  KT_TIMELINE.clearEncrypted = () => {
    localStorage.removeItem(ENC_FORM_KEY);
    alert("Cleared saved encrypted form.");
  };

  KT_TIMELINE.fillForm = (d) => {
    const $ = (id) => document.getElementById(id);
    if(!d) return;

    $("age").value = Number.isFinite(d.age) ? d.age : "";
    $("sex").value = d.sex || "Male";
    $("notes").value = d.notes || "";

    const sxMap = {
      sx_fever:"fever", sx_lowbp:"lowbp", sx_sob:"sob", sx_confusion:"confusion",
      sx_itch:"itch", sx_rash:"rash", sx_insomnia:"insomnia", sx_urine:"urine",
      sx_pain:"pain", sx_ed:"ed"
    };
    for(const [id, key] of Object.entries(sxMap)) $(id).checked = !!(d.sx && d.sx[key]);

    // vitals
    $("temp").value = Number.isFinite(d.temp) ? d.temp : "";
    $("bp").value = d.bp || "";
    $("hr").value = Number.isFinite(d.hr) ? d.hr : "";
    $("rr").value = Number.isFinite(d.rr) ? d.rr : "";
    $("spo2").value = Number.isFinite(d.spo2) ? d.spo2 : "";
    $("weight").value = Number.isFinite(d.weight) ? d.weight : "";

    // labs
    const numFields = ["egfr","creat","urea","bicarb","wbc","hb","plt","eos","na","k","cl","crp","pct","acr","bili","alp"];
    numFields.forEach(f => $(f).value = Number.isFinite(d[f]) ? d[f] : "");
    $("altast").value = d.altast || "";

    $("u_protein").value = d.u_protein || "";
    $("u_blood").value = d.u_blood || "";

    // culture
    $("org").value = d.org || "";
    $("bc_repeat").value = d.bc_repeat || "";
    $("bc_spec").value = d.bc_spec || "";
    $("abx").value = d.abx || "";
  };

  window.KT_TIMELINE = KT_TIMELINE;
})();
