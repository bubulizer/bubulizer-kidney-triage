// charts.js — risk engine + helpers + summary builder (educational, non-prescriptive)

export function egfrStage(e){
  if (!isFinite(e)) return ["Unknown", "Missing eGFR"];
  if (e >= 90) return ["G1", "Normal or high (≥90)"];
  if (e >= 60) return ["G2", "Mildly decreased (60–89)"];
  if (e >= 45) return ["G3a", "Mild–moderate decrease (45–59)"];
  if (e >= 30) return ["G3b", "Moderate–severe decrease (30–44)"];
  if (e >= 15) return ["G4", "Severely decreased (15–29)"];
  return ["G5", "Kidney failure (<15)"];
}

export function parseBP(bpStr){
  if (!bpStr) return null;
  const m = String(bpStr).trim().match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!m) return null;
  return { sys: Number(m[1]), dia: Number(m[2]) };
}

export function classifyRisk(pts){
  if (pts >= 10) return { label: "High risk (urgent clinical assessment)", cls: "danger" };
  if (pts >= 5) return { label: "Moderate risk (same-day clinician review recommended)", cls: "warn" };
  return { label: "Lower risk (still monitor + follow clinician guidance)", cls: "ok" };
}

export function computeRiskScore(inputs){
  // Max 20; conservative screening
  let pts = 0;
  const flags = [];

  // Vitals
  if (isFinite(inputs.temp) && (inputs.temp >= 38.0 || inputs.temp <= 36.0)) { pts += 2; flags.push("Abnormal temperature (infection/physiologic stress)."); }
  if (isFinite(inputs.hr) && inputs.hr >= 100) { pts += 2; flags.push("Tachycardia (consider sepsis/dehydration/pain)."); }
  if (isFinite(inputs.rr) && inputs.rr >= 22) { pts += 3; flags.push("RR ≥ 22 (sepsis screening signal)."); }
  if (isFinite(inputs.spo2) && inputs.spo2 > 0 && inputs.spo2 < 94) { pts += 4; flags.push("SpO₂ < 94% (urgent assessment)."); }

  const bp = parseBP(inputs.bp);
  if (bp && bp.sys < 90) { pts += 4; flags.push("Systolic BP < 90 (shock risk)."); }

  // Kidney risk
  if (isFinite(inputs.egfr)) {
    if (inputs.egfr < 30) { pts += 4; flags.push("eGFR < 30 (high renal risk)."); }
    else if (inputs.egfr < 60) { pts += 2; flags.push("eGFR 30–59 (moderate renal risk)."); }
    else if (inputs.egfr < 90) { pts += 1; }
  }

  // Inflammatory markers (doctor mode)
  if (isFinite(inputs.pct) && inputs.pct >= 0.5) { pts += 3; flags.push("PCT ≥ 0.5 suggests bacterial infection likelihood (interpret clinically)."); }
  if (isFinite(inputs.crp) && inputs.crp >= 10) { pts += 2; flags.push("CRP elevated (active inflammation/infection possible)."); }

  // Culture status (doctor mode)
  const org = (inputs.org || "").toLowerCase();
  if (org.includes("staph")) pts += 1;
  if (inputs.bc_repeat && String(inputs.bc_repeat).includes("still positive")) { pts += 3; flags.push("Repeat culture still positive (persistent bacteremia concern)."); }
  if (inputs.bc_spec === "Staphylococcus aureus") { pts += 4; flags.push("Staph aureus bacteremia risk (needs urgent clinician-led management)."); }

  // Itch / eos / LFTs
  if (inputs.sx_itch && isFinite(inputs.eos) && inputs.eos > 6) { pts += 1; flags.push("Itch + eosinophilia: consider allergy/drug reaction/parasites."); }
  if (inputs.sx_itch && ((isFinite(inputs.alp) && inputs.alp > 120) || (isFinite(inputs.bili) && inputs.bili > 1.2))) {
    pts += 2; flags.push("Itch + cholestatic markers (ALP/bilirubin) — evaluate liver/bile causes.");
  }

  // Symptoms
  if (inputs.sx_confusion) { pts += 3; flags.push("Confusion is a red-flag symptom."); }
  if (inputs.sx_lowbp) { pts += 2; }
  if (inputs.sx_sob) { pts += 2; }

  pts = Math.max(0, Math.min(20, pts));
  return { pts, flags };
}

export function countryHintText(country){
  const base = `
<b>Safety-first (all countries):</b>
• If blood culture shows <b>Staphylococcus spp.</b>, clinician must confirm <b>contamination vs true bacteremia</b> (repeat cultures, speciation).
• <b>Staph aureus</b> bacteremia needs urgent clinician-led management (source control; repeat cultures; evaluate for complications as per guideline).
• Avoid self-medicating with leftover antibiotics; it fuels resistance and can worsen outcomes.`;

  const ng = `
<b>Nigeria (NG) – context (non-prescriptive):</b>
• Resistance can be higher where antibiotics are easy to access; clinicians often prioritize <b>culture-guided therapy</b>.
• “Staph spp.” without speciation is a red flag for under-specifying the problem.`;

  const ug = `
<b>Uganda (UG) – context (non-prescriptive):</b>
• Repeat blood culture + clear speciation/susceptibility matters, especially across referrals.`;

  const ke = `
<b>Kenya (KE) – context (non-prescriptive):</b>
• Stewardship programs emphasize avoiding unnecessary broad-spectrum antibiotics; de-escalate based on sensitivity.`;

  return base + "<br><br>" + (country === "NG" ? ng : country === "UG" ? ug : ke);
}

export function buildSummary(data, risk){
  const [stage, stageLabel] = egfrStage(data.egfr);
  const symptomKeys = Object.entries(data.sx).filter(([,v])=>v).map(([k])=>k);
  const symptomText = symptomKeys.length ? symptomKeys.join(", ") : "none reported";
  const bp = parseBP(data.bp);
  const bpText = bp ? `${bp.sys}/${bp.dia}` : (data.bp || "NA");

  const safety = [];
  if (data.sx.itch){
    safety.push("• Itching first-aid: fragrance-free moisturizer, cool showers, avoid harsh soaps; if rash/swelling or breathing symptoms occur, seek urgent care.");
    safety.push("• If itching returns with new meds/herbs, clinician should review for drug/allergy reaction; eosinophilia can support that pattern.");
  }
  safety.push("• Kidney safety: avoid unnecessary NSAIDs (e.g., ibuprofen/diclofenac) unless a clinician says otherwise; many antibiotics need renal dose adjustment.");
  if (data.sx.insomnia) safety.push("• Insomnia: fixed sleep/wake time, reduce caffeine after noon, reduce screens before bed; persistent insomnia deserves clinician review.");
  if (data.sx.ed) safety.push("• Erectile issues: can follow illness/stress/poor sleep; if persistent, consider BP/glucose/HbA1c/lipids/testosterone/thyroid via clinician.");

  const redFlags = risk.flags.length ? risk.flags.map(x => "• " + x).join("\n") : "• None detected from entered data (still requires clinical judgement).";

  return `CASE SUMMARY (Educational triage support; not a prescription)

Country context: ${data.country}
Mode: ${data.mode.toUpperCase()}

PATIENT
- Age/Sex: ${data.age || "?"} y/o ${data.sex}
- Symptoms: ${symptomText}
- Notes: ${data.notes || "NA"}

VITALS
- Temp: ${isFinite(data.temp) ? data.temp + " °C" : "NA"}
- BP: ${bpText}
- HR: ${isFinite(data.hr) ? data.hr + " bpm" : "NA"}
- RR: ${isFinite(data.rr) ? data.rr + " /min" : "NA"}
- SpO₂: ${isFinite(data.spo2) ? data.spo2 + " %" : "NA"}

KEY LABS
- eGFR: ${isFinite(data.egfr) ? data.egfr : "NA"} mL/min/1.73m² → ${stage} (${stageLabel})
- Creatinine: ${isFinite(data.creat) ? data.creat : "NA"} mg/dL
- Urea: ${isFinite(data.urea) ? data.urea : "NA"} mg/dL
- Bicarbonate: ${isFinite(data.bicarb) ? data.bicarb : "NA"} mmol/L
- CBC: WBC ${isFinite(data.wbc) ? data.wbc : "NA"} ×10⁹/L; Hb ${isFinite(data.hb) ? data.hb : "NA"} g/dL; Platelets ${isFinite(data.plt) ? data.plt : "NA"} ×10⁹/L; Eosinophils ${isFinite(data.eos) ? data.eos : "NA"} %

DOCTOR-ONLY (if provided)
- Electrolytes: Na ${isFinite(data.na) ? data.na : "NA"}; K ${isFinite(data.k) ? data.k : "NA"}; Cl ${isFinite(data.cl) ? data.cl : "NA"} mmol/L
- Urine: Protein ${data.u_protein || "NA"}; Blood ${data.u_blood || "NA"}; ACR ${isFinite(data.acr) ? data.acr : "NA"} mg/g
- Inflammation: CRP ${isFinite(data.crp) ? data.crp : "NA"} mg/L; Procalcitonin ${isFinite(data.pct) ? data.pct : "NA"} ng/mL
- LFTs: Bilirubin ${isFinite(data.bili) ? data.bili : "NA"} mg/dL; ALP ${isFinite(data.alp) ? data.alp : "NA"} U/L; ALT/AST ${data.altast || "NA"}
- Culture: Organism ${data.org || "NA"}; Repeated ${data.bc_repeat || "NA"}; Speciation ${data.bc_spec || "NA"}
- Antibiogram: ${data.abx || "NA"}

RISK SCREEN (Educational)
- Score: ${risk.pts}/20 → ${classifyRisk(risk.pts).label}

RED FLAGS / URGENCY SIGNALS
${redFlags}

NEXT HIGH-VALUE CLINICIAN QUESTIONS
• Was blood culture repeated? Speciation done (Staph aureus vs CoNS)? Any source (skin/wound/line/urinary/dental)?
• Current meds (including herbs) + allergies? Any recent antibiotic exposure?
• Repeat creatinine/eGFR and trend; urine ACR/urinalysis; assess BP/volume status.

SYMPTOM SAFETY NOTES (non-prescriptive)
${safety.join("\n")}

GPT PROMPT (safe, non-prescriptive)
SYSTEM: You are clinical decision-support. Do not prescribe antibiotics or dosing. Provide differential, red flags, and next-step questions.
USER: Review this summary and suggest safe next steps and symptom-relief options without prescribing.
`;
}
