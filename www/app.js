/* app.js — wires UI, risk engine, summary generation, PWA install */
(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Helpers ----------
  function setBodyMode(mode){
    document.body.classList.toggle("doctor", mode === "doctor");
  }

  function safeNum(v){ const n = Number(v); return Number.isFinite(n) ? n : NaN; }

  function parseBP(bpStr){
    if(!bpStr) return null;
    const m = String(bpStr).trim().match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
    if(!m) return null;
    return { sys: Number(m[1]), dia: Number(m[2]) };
  }

  function egfrStage(e){
    if(!Number.isFinite(e)) return ["Unknown","Missing eGFR"];
    if(e >= 90) return ["G1","Normal or high (≥90)"];
    if(e >= 60) return ["G2","Mildly decreased (60–89)"];
    if(e >= 45) return ["G3a","Mild–moderate decrease (45–59)"];
    if(e >= 30) return ["G3b","Moderate–severe decrease (30–44)"];
    if(e >= 15) return ["G4","Severely decreased (15–29)"];
    return ["G5","Kidney failure (<15)"];
  }

  function classifyRisk(pts){
    if(pts >= 10) return { label:"High risk (urgent clinical assessment)", cls:"chip-danger", bar:"#b00020" };
    if(pts >= 5)  return { label:"Moderate risk (same-day clinician review)", cls:"chip-warn", bar:"#b36b00" };
    return { label:"Lower risk (monitor + clinician guidance)", cls:"chip-ok", bar:"#0b6b2f" };
  }

  // ---------- Country hints ----------
  function countryHintText(country){
    const base = `
<b>Safety-first (all countries):</b><br>
• If blood culture shows <b>Staphylococcus spp.</b>, clinician must confirm <b>contamination vs true bacteremia</b> (repeat cultures, speciation).<br>
• <b>Staph aureus</b> bacteremia is not “small”. It needs urgent clinician-led management (source control + repeat cultures; echocardiography in selected cases).<br>
• Avoid self-medicating with leftover antibiotics. It fuels resistance and can backfire.<br>`;

    const ng = `<br><b>Nigeria (NG) — resistance hints (non-prescriptive):</b><br>
• Where antibiotics are easy to buy, resistance trends can be rough. Let culture results lead whenever possible.<br>
• “Staph spp.” without speciation is underpowered information — push for speciation and sensitivities.<br>`;

    const ug = `<br><b>Uganda (UG) — resistance hints (non-prescriptive):</b><br>
• Empiric choices vary by facility; documentation + de-escalation from sensitivity results matters, especially after referral.<br>`;

    const ke = `<br><b>Kenya (KE) — resistance hints (non-prescriptive):</b><br>
• Stewardship programs increasingly emphasize avoiding unnecessary broad-spectrum agents; de-escalate when sensitivities return.<br>`;

    return base + (country === "NG" ? ng : country === "UG" ? ug : ke);
  }

  // ---------- Risk engine (educational) ----------
  function computeRiskScore(d){
    let pts = 0;
    const flags = [];

    // Vitals
    if(Number.isFinite(d.temp) && (d.temp >= 38.0 || d.temp <= 36.0)){ pts += 2; flags.push("Abnormal temperature (infection/physiologic stress)."); }
    if(Number.isFinite(d.hr) && d.hr >= 100){ pts += 2; flags.push("Tachycardia (consider sepsis/dehydration/pain)."); }
    if(Number.isFinite(d.rr) && d.rr >= 22){ pts += 3; flags.push("RR ≥ 22 (sepsis screen positive)."); }
    if(Number.isFinite(d.spo2) && d.spo2 > 0 && d.spo2 < 94){ pts += 4; flags.push("SpO₂ < 94% (urgent assessment)."); }

    const bp = parseBP(d.bp);
    if(bp && bp.sys < 90){ pts += 4; flags.push("Systolic BP < 90 (shock risk)."); }

    // Kidney
    if(Number.isFinite(d.egfr)){
      if(d.egfr < 30){ pts += 4; flags.push("eGFR < 30 (high renal risk)."); }
      else if(d.egfr < 60){ pts += 2; flags.push("eGFR 30–59 (moderate renal risk)."); }
      else if(d.egfr < 90){ pts += 1; }
    }
    if(d.sx_urine && Number.isFinite(d.egfr) && d.egfr < 60){ pts += 2; flags.push("Reduced urine + reduced eGFR (same-day assessment)."); }

    // Inflammation
    if(Number.isFinite(d.pct) && d.pct >= 0.5){ pts += 3; flags.push("PCT ≥ 0.5 suggests bacterial infection likelihood (interpret clinically)."); }
    if(Number.isFinite(d.crp) && d.crp >= 10){ pts += 2; flags.push("CRP elevated (inflammation/infection possible)."); }

    // Culture
    const org = (d.org || "").toLowerCase();
    if(org.includes("staph")) pts += 1;
    if(d.bc_repeat && d.bc_repeat.includes("still positive")){ pts += 3; flags.push("Repeat culture still positive (persistent bacteremia concern)."); }
    if(d.bc_spec === "Staphylococcus aureus"){ pts += 4; flags.push("Staph aureus bacteremia signal (urgent clinician-led management)."); }

    // Itch patterns
    if(d.sx_itch && Number.isFinite(d.eos) && d.eos > 6){ pts += 1; flags.push("Itch + eosinophilia: consider allergy/drug reaction/parasites."); }
    if(d.sx_itch && ((Number.isFinite(d.alp) && d.alp > 120) || (Number.isFinite(d.bili) && d.bili > 1.2))){ pts += 2; flags.push("Itch + cholestatic markers (ALP/bilirubin) — evaluate liver/bile causes."); }

    // Red-flag symptoms
    if(d.sx_confusion){ pts += 3; flags.push("Confusion is a red-flag symptom."); }
    if(d.sx_lowbp){ pts += 2; }
    if(d.sx_sob){ pts += 2; }

    pts = Math.max(0, Math.min(20, pts));
    return { pts, flags };
  }

  // ---------- Form collection ----------
  function collect(){
    const sx = {
      fever: $("sx_fever").checked,
      lowbp: $("sx_lowbp").checked,
      sob: $("sx_sob").checked,
      confusion: $("sx_confusion").checked,
      itch: $("sx_itch").checked,
      rash: $("sx_rash").checked,
      insomnia: $("sx_insomnia").checked,
      urine: $("sx_urine").checked,
      pain: $("sx_pain").checked,
      ed: $("sx_ed").checked,
    };

    return {
      age: safeNum($("age").value),
      sex: $("sex").value,
      notes: $("notes").value.trim(),
      sx,
      temp: safeNum($("temp").value),
      bp: $("bp").value.trim(),
      hr: safeNum($("hr").value),
      rr: safeNum($("rr").value),
      spo2: safeNum($("spo2").value),
      weight: safeNum($("weight").value),

      egfr: safeNum($("egfr").value),
      creat: safeNum($("creat").value),
      urea: safeNum($("urea").value),
      bicarb: safeNum($("bicarb").value),
      wbc: safeNum($("wbc").value),
      hb: safeNum($("hb").value),
      plt: safeNum($("plt").value),
      eos: safeNum($("eos").value),
      na: safeNum($("na").value),
      k: safeNum($("k").value),
      cl: safeNum($("cl").value),

      crp: safeNum($("crp").value),
      pct: safeNum($("pct").value),
      acr: safeNum($("acr").value),
      u_protein: $("u_protein").value,
      u_blood: $("u_blood").value,

      bili: safeNum($("bili").value),
      alp: safeNum($("alp").value),
      altast: $("altast").value.trim(),

      org: $("org").value.trim(),
      bc_repeat: $("bc_repeat").value,
      bc_spec: $("bc_spec").value,
      abx: $("abx").value.trim(),

      brand: $("brandSelect").value,
      country: $("country").value,
      mode: $("mode").value,
      ts: new Date().toISOString()
    };
  }

  // ---------- Summary + badges ----------
  function symptomText(sx){
    const map = {
      fever:"fever/chills",
      lowbp:"dizziness/low BP",
      sob:"shortness of breath",
      confusion:"confusion",
      itch:"itching",
      rash:"rash/swelling",
      insomnia:"insomnia",
      urine:"reduced/dark urine",
      pain:"severe pain",
      ed:"erectile issues",
    };
    return Object.entries(sx).filter(([,v]) => v).map(([k]) => map[k]).join(", ") || "none reported";
  }

  function fmt(n, unit){
    return Number.isFinite(n) ? `${n}${unit||""}` : "NA";
  }

  function buildSummary(d, risk){
    const [stage, stageLabel] = egfrStage(d.egfr);
    const bp = parseBP(d.bp);
    const bpText = bp ? `${bp.sys}/${bp.dia}` : (d.bp || "NA");
    const brandText = d.brand === "drpius" ? "Dr. Pius Erheyovwe Bubu" : "BUBULIZER Solutions";

    const safety = [];
    if(d.sx.itch){
      safety.push("• Itching first-aid: fragrance-free moisturizer, cool showers, avoid harsh soaps; if rash/swelling or breathing symptoms occur, seek urgent care.");
      safety.push("• If itching returns with new meds/herbs, clinician should review for drug/allergy reaction; eosinophilia can support that pattern.");
    }
    safety.push("• Kidney safety: avoid unnecessary NSAIDs (e.g., ibuprofen/diclofenac) unless a clinician says otherwise; many antibiotics need renal dose adjustment.");
    if(d.sx.insomnia) safety.push("• Insomnia: fixed sleep/wake time, reduce caffeine after noon, reduce screens before bed; persistent insomnia deserves clinician review.");
    if(d.sx.ed) safety.push("• Erectile issues: can follow illness/stress/poor sleep; if persistent, consider BP + glucose/HbA1c + thyroid/testosterone with clinician.");

    const rf = risk.flags.length ? risk.flags.map(x => "• " + x).join("\n") : "• None detected from entered data (still requires clinical judgement).";

    return `CASE SUMMARY (Educational decision-support; not a prescription)

Brand: ${brandText}
Country context: ${d.country}
Mode: ${d.mode}

PATIENT
- Age/Sex: ${Number.isFinite(d.age) ? d.age : "?"} y/o ${d.sex}
- Symptoms: ${symptomText(d.sx)}
- Notes: ${d.notes || "NA"}

VITALS
- Temp: ${fmt(d.temp," °C")}
- BP: ${bpText}
- HR: ${fmt(d.hr," bpm")}
- RR: ${fmt(d.rr," /min")}
- SpO₂: ${fmt(d.spo2," %")}

KEY LABS
- eGFR: ${fmt(d.egfr,"")} mL/min/1.73m² → ${stage} (${stageLabel})
- Creatinine: ${fmt(d.creat,"")} mg/dL
- Urea: ${fmt(d.urea,"")} mg/dL
- Bicarbonate: ${fmt(d.bicarb,"")} mmol/L
- CBC: WBC ${fmt(d.wbc,"")} ×10⁹/L; Hb ${fmt(d.hb,"")} g/dL; Platelets ${fmt(d.plt,"")} ×10⁹/L; Eosinophils ${fmt(d.eos,"%")}
- Electrolytes: Na ${fmt(d.na,"")}; K ${fmt(d.k,"")}; Cl ${fmt(d.cl,"")} mmol/L
- Inflammation: CRP ${fmt(d.crp,"")} mg/L; Procalcitonin ${fmt(d.pct,"")} ng/mL
- Urine: Protein ${d.u_protein || "NA"}; Blood ${d.u_blood || "NA"}; ACR ${fmt(d.acr,"")} mg/g
- LFTs (itching): Bilirubin ${fmt(d.bili,"")} mg/dL; ALP ${fmt(d.alp,"")} U/L; ALT/AST ${d.altast || "NA"}

BLOOD CULTURE
- Organism: ${d.org || "NA"}
- Repeated: ${d.bc_repeat || "NA"}
- Speciation: ${d.bc_spec || "NA"}
- Antibiogram: ${d.abx || "NA"}

RISK SCREEN (Educational)
- Score: ${risk.pts}/20 → ${classifyRisk(risk.pts).label}

RED FLAGS / URGENCY SIGNALS
${rf}

NEXT HIGH-VALUE CLINICIAN QUESTIONS
• Was blood culture repeated? Speciation done (Staph aureus vs CoNS)? Any likely source (skin/wound/line/urinary/dental)?
• Current meds list (including herbs) and allergies? Any recent antibiotic exposure?
• If kidney concern: repeat creatinine/eGFR, trend ACR/urinalysis, assess volume status and BP.

SYMPTOM SAFETY NOTES (non-prescriptive)
${safety.join("\n")}

GPT PROMPT (non-prescriptive)
SYSTEM: You are clinical decision-support. Do not prescribe antibiotics. Provide differential, red flags, and next-step questions aligned with local Africa context.
USER: Review this case summary, interpret labs/vitals, and suggest safe next steps and symptom-relief options without prescribing.
`;
  }

  function renderBadges(d, riskPts){
    const badges = $("badges");
    badges.innerHTML = "";

    const [stage] = egfrStage(d.egfr);
    const kidneyCls = (!Number.isFinite(d.egfr)) ? "chip-warn" : (d.egfr >= 90 ? "chip-ok" : (d.egfr >= 60 ? "chip-warn" : "chip-danger"));
    const mk = (cls, text) => {
      const s = document.createElement("span");
      s.className = "chip " + cls;
      s.textContent = text;
      s.style.marginRight = "6px";
      s.style.marginBottom = "6px";
      return s;
    };

    badges.appendChild(mk(kidneyCls, `Kidney: ${stage}`));
    if(Number.isFinite(d.wbc)) badges.appendChild(mk((d.wbc >= 3.5 && d.wbc <= 11) ? "chip-ok" : "chip-warn", `WBC: ${d.wbc}`));
    if(Number.isFinite(d.eos)) badges.appendChild(mk((d.eos <= 6) ? "chip-ok" : "chip-warn", `Eos: ${d.eos}%`));
    if(d.org) badges.appendChild(mk("chip-warn", `Culture: ${d.org}`));

    const r = classifyRisk(riskPts);
    badges.appendChild(mk(r.cls, `Risk: ${r.label.split(" (")[0]}`));
  }

  function renderRisk(pts){
    const r = classifyRisk(pts);
    $("riskLabel").textContent = r.label;
    $("riskPoints").textContent = `${pts} / 20`;
    $("riskPoints").className = "chip " + r.cls;
    const pct = Math.round((pts / 20) * 100);
    $("riskBar").style.width = pct + "%";
    $("riskBar").style.background = r.bar;
  }

  function analyze(){
    const d = collect();
    $("countryHints").innerHTML = countryHintText(d.country);

    const risk = computeRiskScore({
      temp:d.temp, hr:d.hr, rr:d.rr, spo2:d.spo2, bp:d.bp,
      egfr:d.egfr, crp:d.crp, pct:d.pct,
      org:d.org, bc_repeat:d.bc_repeat, bc_spec:d.bc_spec,
      eos:d.eos, alp:d.alp, bili:d.bili,
      sx_itch: d.sx.itch, sx_confusion:d.sx.confusion, sx_lowbp:d.sx.lowbp, sx_sob:d.sx.sob,
      sx_urine: d.sx.urine
    });

    renderRisk(risk.pts);
    renderBadges(d, risk.pts);

    const summary = buildSummary(d, risk);
    $("output").textContent = summary;

    // Report tab mirrors latest summary
    const brandText = d.brand === "drpius" ? "Dr. Pius Erheyovwe Bubu" : "BUBULIZER Solutions";
    $("reportTitle").textContent = brandText;
    $("footerBrand").textContent = brandText;
    $("reportMeta").textContent = `Kidney + Infection First‑Aid Triage Helper (Educational) • ${d.country} • ${new Date().toLocaleString()}`;
    $("reportSummary").textContent = summary;

    // Update trend preview with latest point (not saved yet)
    window.KT_CHARTS.previewPoint({ ts:d.ts, egfr:d.egfr, creat:d.creat, crp:d.crp, risk:risk.pts });
  }

  // ---------- Tabs ----------
  function showTab(name){
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("show"));
    $("tab-" + name).classList.add("show");

    if(name === "timeline"){
      window.KT_TIMELINE.render();
      window.KT_CHARTS.renderFromTimeline(window.KT_TIMELINE.getAll());
    }
  }

  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));

  // ---------- Demo ----------
  function loadDemo(){
    $("age").value = "60";
    $("sex").value = "Male";
    $("egfr").value = "84";
    $("creat").value = "1.10";
    $("urea").value = "14.4";
    $("bicarb").value = "20";
    $("wbc").value = "7.6";
    $("hb").value = "13.0";
    $("plt").value = "299";
    $("eos").value = "7.0";
    $("org").value = "Staphylococcus spp.";
    $("bc_repeat").value = "No";
    $("bc_spec").value = "Not speciated";
    $("sx_itch").checked = true;
    $("sx_insomnia").checked = true;
    $("sx_ed").checked = true;
    $("notes").value = "Itching stopped for now; infection not yet treated; insomnia; erectile changes. (Demo)";
    analyze();
  }

  // ---------- Copy / PDF ----------
  async function copySummary(){
    try{
      await navigator.clipboard.writeText($("output").textContent);
      alert("Copied summary.");
    }catch{
      alert("Copy failed. Select the text and copy manually.");
    }
  }

  // ---------- PWA install ----------
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
  $("installBtn").addEventListener("click", async () => {
    if(!deferredPrompt){
      alert("Install prompt not available. On mobile: browser menu → Add to Home Screen.");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });

  // ---------- Buttons ----------
  $("analyzeBtn").addEventListener("click", analyze);
  $("pdfBtn").addEventListener("click", () => window.print());
  $("printReportBtn").addEventListener("click", () => window.print());
  $("demoBtn").addEventListener("click", loadDemo);
  $("copyBtn").addEventListener("click", copySummary);

  $("savePointBtn").addEventListener("click", () => {
    analyze(); // ensure latest risk exists
    const d = collect();
    const lastRiskText = $("riskPoints").textContent.split("/")[0].trim();
    const riskPts = Number(lastRiskText) || 0;
    window.KT_TIMELINE.addPoint({
      ts: d.ts,
      country: d.country,
      brand: d.brand,
      mode: d.mode,
      egfr: d.egfr,
      creat: d.creat,
      crp: d.crp,
      pct: d.pct,
      spo2: d.spo2,
      risk: riskPts,
      notes: d.notes,
    });
    alert("Saved to timeline.");
  });

  // Timeline controls
  $("exportTimelineBtn").addEventListener("click", () => window.KT_TIMELINE.exportJSON());
  $("importTimelineBtn").addEventListener("click", () => window.KT_TIMELINE.importJSON());
  $("clearTimelineBtn").addEventListener("click", () => {
    if(confirm("Clear timeline on this device?")) window.KT_TIMELINE.clear();
  });

  // Doctor vs patient mode
  $("mode").addEventListener("change", () => setBodyMode($("mode").value));

  // Branding / country changes
  function applyBranding(){
    const v = $("brandSelect").value;
    const brandText = v === "drpius" ? "Dr. Pius Erheyovwe Bubu" : "BUBULIZER Solutions";
    $("reportTitle").textContent = brandText;
    $("footerBrand").textContent = brandText;
    document.title = `Kidney + Infection First-Aid Triage Helper — ${brandText.includes("BUBULIZER") ? "BUBULIZER" : "Dr. Bubu"}`;
  }
  $("brandSelect").addEventListener("change", applyBranding);

  $("country").addEventListener("change", () => {
    $("countryPill").textContent = $("country").value;
    $("countryHints").innerHTML = countryHintText($("country").value);
  });

  // Settings: encrypted storage hooks from timeline.js
  $("saveEncBtn").addEventListener("click", async () => {
    try{
      const pass = $("passphrase").value;
      await window.KT_TIMELINE.saveEncryptedForm(pass, collect());
      alert("Saved form (encrypted) to this device.");
    }catch(e){ alert("Save failed: " + (e?.message || String(e))); }
  });
  $("loadEncBtn").addEventListener("click", async () => {
    try{
      const pass = $("passphrase").value;
      const d = await window.KT_TIMELINE.loadEncryptedForm(pass);
      if(!d){ alert("No saved form found."); return; }
      window.KT_TIMELINE.fillForm(d);
      $("country").value = d.country || $("country").value;
      $("brandSelect").value = d.brand || $("brandSelect").value;
      $("mode").value = d.mode || $("mode").value;
      $("countryPill").textContent = $("country").value;
      setBodyMode($("mode").value);
      applyBranding();
      analyze();
      alert("Loaded form (decrypted).");
    }catch(e){ alert("Load failed: " + (e?.message || String(e))); }
  });
  $("clearEncBtn").addEventListener("click", () => window.KT_TIMELINE.clearEncrypted());

  // GPT proxy
  $("askGptBtn").addEventListener("click", async () => {
    if($("gptEnabled").value !== "yes"){
      alert("Enable GPT proxy in Settings first.");
      return;
    }
    analyze();
    const endpoint = $("gptEndpoint").value.trim() || "/api/gpt";
    const reply = await window.KT_GPT.askViaProxy(endpoint, $("output").textContent.trim());
    $("gptReply").textContent = reply;
  });

  // ---------- Init ----------
  $("year").textContent = new Date().getFullYear();
  $("countryPill").textContent = $("country").value;
  $("countryHints").innerHTML = countryHintText($("country").value);
  setBodyMode($("mode").value);
  applyBranding();
  window.KT_CHARTS.init($("trendCanvas"));
  window.KT_TIMELINE.init({ listEl: $("timelineList") });

  // Default to triage tab
  showTab("triage");

})();
