// app.js — UI wiring: disclaimer + PIN gating + risk engine + timeline + optional GPT proxy
import { computeRiskScore, classifyRisk, egfrStage, parseBP, countryHintText, buildSummary } from './charts.js';
import { Timeline } from './timeline.js';
import { askGPT } from './gpt-bridge.js';

const $ = (id) => document.getElementById(id);

// Storage keys
const LS = {
  disclaimerAccepted: 'bubulizer_disclaimer_accepted_v1',
  mode: 'bubulizer_mode_v1',             // 'patient' | 'doctor'
  pinHash: 'bubulizer_doctor_pin_hash_v1',
  pinSalt: 'bubulizer_doctor_pin_salt_v1',
  doctorUnlocked: 'bubulizer_doctor_unlocked_v1' // sessionStorage
};

function setGateOpen(el, open){
  el.classList.toggle('isOpen', !!open);
  el.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function showDisclaimerIfNeeded(){
  const accepted = localStorage.getItem(LS.disclaimerAccepted) === '1';
  if (!accepted) setGateOpen($('disclaimerGate'), true);
}

function wireDisclaimer(){
  $('agreeChk').addEventListener('change', (e) => {
    $('agreeBtn').disabled = !e.target.checked;
  });
  $('agreeBtn').addEventListener('click', () => {
    localStorage.setItem(LS.disclaimerAccepted, '1');
    setGateOpen($('disclaimerGate'), false);
    enforceMode();
  });
  $('printDisclaimerBtn').addEventListener('click', () => window.print());
}

function b64(u8){
  let bin = '';
  u8.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}
function unb64(str){
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomBytes(len){
  const u = new Uint8Array(len);
  crypto.getRandomValues(u);
  return u;
}
async function hashPin(pin, saltB64){
  const salt = unb64(saltB64);
  const bytes = new TextEncoder().encode(`${pin}:${b64(salt)}`);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return b64(new Uint8Array(buf));
}
function hasPin(){
  return !!localStorage.getItem(LS.pinHash) && !!localStorage.getItem(LS.pinSalt);
}

function setModeUI(mode){
  $('modePatientBtn').classList.toggle('isActive', mode === 'patient');
  $('modeDoctorBtn').classList.toggle('isActive', mode === 'doctor');

  const unlocked = sessionStorage.getItem(LS.doctorUnlocked) === '1';
  document.querySelectorAll('.doctorOnly').forEach(el => {
    el.hidden = !(mode === 'doctor' && unlocked);
  });
}

function openPinGate(){
  setGateOpen($('pinGate'), true);
  $('pinSetupMsg').textContent = '';
  $('pinUnlockMsg').textContent = '';

  if (!hasPin()){
    $('pinSetup').hidden = false;
    $('pinUnlock').hidden = true;
  } else {
    $('pinSetup').hidden = true;
    $('pinUnlock').hidden = false;
  }

  $('newPin').value = '';
  $('newPin2').value = '';
  $('pinInput').value = '';
}

function closePinGate(){ setGateOpen($('pinGate'), false); }

function wirePinGate(){
  $('setPinBtn').addEventListener('click', async () => {
    const p1 = $('newPin').value.trim();
    const p2 = $('newPin2').value.trim();
    if (!/^\d{4,8}$/.test(p1)) { $('pinSetupMsg').textContent = 'PIN must be 4–8 digits.'; return; }
    if (p1 !== p2) { $('pinSetupMsg').textContent = 'PINs do not match.'; return; }

    const salt = b64(randomBytes(16));
    const h = await hashPin(p1, salt);
    localStorage.setItem(LS.pinSalt, salt);
    localStorage.setItem(LS.pinHash, h);

    $('pinSetupMsg').textContent = 'PIN set. Now unlock Doctor mode.';
    $('pinSetup').hidden = true;
    $('pinUnlock').hidden = false;
  });

  $('unlockBtn').addEventListener('click', async () => {
    const pin = $('pinInput').value.trim();
    if (!/^\d{4,8}$/.test(pin)) { $('pinUnlockMsg').textContent = 'Enter a valid 4–8 digit PIN.'; return; }

    const salt = localStorage.getItem(LS.pinSalt);
    const expected = localStorage.getItem(LS.pinHash);
    const got = await hashPin(pin, salt);

    if (got !== expected){ $('pinUnlockMsg').textContent = 'Wrong PIN.'; return; }

    sessionStorage.setItem(LS.doctorUnlocked, '1');
    localStorage.setItem(LS.mode, 'doctor');
    closePinGate();
    setModeUI('doctor');
    applyCountryHints();
  });

  $('forgotPinBtn').addEventListener('click', () => {
    if (!confirm('This resets the Doctor PIN on this device. Continue?')) return;
    localStorage.removeItem(LS.pinSalt);
    localStorage.removeItem(LS.pinHash);
    sessionStorage.removeItem(LS.doctorUnlocked);
    $('pinUnlockMsg').textContent = 'PIN reset. Set a new PIN.';
    $('pinSetup').hidden = false;
    $('pinUnlock').hidden = true;
  });

  $('cancelPinBtn1').addEventListener('click', () => { closePinGate(); localStorage.setItem(LS.mode,'patient'); setModeUI('patient'); });
  $('cancelPinBtn2').addEventListener('click', () => { closePinGate(); localStorage.setItem(LS.mode,'patient'); setModeUI('patient'); });
}

function wireModeButtons(){
  $('modePatientBtn').addEventListener('click', () => {
    localStorage.setItem(LS.mode, 'patient');
    sessionStorage.removeItem(LS.doctorUnlocked);
    setModeUI('patient');
  });

  $('modeDoctorBtn').addEventListener('click', () => {
    localStorage.setItem(LS.mode, 'doctor');
    const accepted = localStorage.getItem(LS.disclaimerAccepted) === '1';
    if (!accepted){ showDisclaimerIfNeeded(); return; }
    openPinGate();
  });

  $('lockBtn').addEventListener('click', () => {
    sessionStorage.removeItem(LS.doctorUnlocked);
    localStorage.setItem(LS.mode, 'patient');
    setModeUI('patient');
    alert('Doctor mode locked.');
  });
}

function wireBrand(){
  $('brandSelect').addEventListener('change', () => {
    $('brandTag').textContent = ($('brandSelect').value === 'drpius') ? 'Dr. Pius Erheyovwe Bubu' : 'BUBULIZER Solutions';
    $('builtBy').textContent = $('brandTag').textContent;
  });
}

function wireCountry(){
  $('country').addEventListener('change', () => {
    $('countryPill').textContent = $('country').value;
    applyCountryHints();
  });
}

function applyCountryHints(){
  const el = $('countryHints');
  if (el) el.innerHTML = countryHintText($('country').value);
}

function wirePdfCopy(){
  $('pdfBtn').addEventListener('click', () => window.print());
  $('copyBtn').addEventListener('click', async () => {
    try{
      await navigator.clipboard.writeText($('output').textContent);
      alert('Copied summary.');
    }catch{
      alert('Copy failed. Please select and copy manually.');
    }
  });
}

function collectData(){
  return {
    age: Number($('age').value),
    sex: $('sex').value,
    notes: $('notes').value.trim(),
    sx: {
      fever: $('sx_fever').checked,
      lowbp: $('sx_lowbp').checked,
      sob: $('sx_sob').checked,
      confusion: $('sx_confusion').checked,
      itch: $('sx_itch').checked,
      rash: $('sx_rash').checked,
      insomnia: $('sx_insomnia').checked,
      urine: $('sx_urine').checked,
      pain: $('sx_pain').checked,
      ed: $('sx_ed').checked
    },
    temp: Number($('temp').value),
    bp: $('bp').value.trim(),
    hr: Number($('hr').value),
    rr: Number($('rr').value),
    spo2: Number($('spo2').value),

    egfr: Number($('egfr').value),
    creat: Number($('creat').value),
    urea: Number($('urea').value),
    bicarb: Number($('bicarb').value),
    wbc: Number($('wbc').value),
    hb: Number($('hb').value),
    plt: Number($('plt').value),
    eos: Number($('eos').value),

    na: Number($('na')?.value),
    k: Number($('k')?.value),
    cl: Number($('cl')?.value),

    u_protein: $('u_protein')?.value,
    u_blood: $('u_blood')?.value,
    acr: Number($('acr')?.value),

    crp: Number($('crp')?.value),
    pct: Number($('pct')?.value),

    bili: Number($('bili')?.value),
    alp: Number($('alp')?.value),
    altast: $('altast')?.value?.trim(),

    org: $('org')?.value?.trim(),
    bc_repeat: $('bc_repeat')?.value,
    bc_spec: $('bc_spec')?.value,
    abx: $('abx')?.value?.trim(),

    country: $('country').value,
    mode: (sessionStorage.getItem(LS.doctorUnlocked) === '1') ? 'doctor' : 'patient'
  };
}

function renderRisk(riskPts){
  const { label, cls } = classifyRisk(riskPts);
  $('riskLabel').textContent = label;
  $('riskPoints').textContent = `${riskPts} / 20`;
  $('riskPoints').className = `pill ${cls}`;
  const pct = Math.round((riskPts / 20) * 100);
  $('riskBar').style.width = pct + '%';
  $('riskBar').style.background = (cls === 'danger') ? '#b00020' : (cls === 'warn') ? '#b36b00' : '#0b6b2f';
}

function makeBadge(cls, text){
  const s = document.createElement('span');
  s.className = `pill ${cls}`;
  s.textContent = text;
  return s;
}

function renderBadges(data, riskPts){
  const badges = $('badges');
  badges.innerHTML = '';
  const [stage, stageLabel] = egfrStage(data.egfr);
  const kidneyCls = (!isFinite(data.egfr)) ? 'warn' : (data.egfr >= 90 ? 'ok' : (data.egfr >= 60 ? 'warn' : 'danger'));
  badges.appendChild(makeBadge(kidneyCls, `Kidney: ${stage} (${stageLabel})`));
  if (isFinite(data.wbc)) badges.appendChild(makeBadge((data.wbc >= 3.5 && data.wbc <= 11) ? 'ok' : 'warn', `WBC: ${data.wbc}`));
  if (isFinite(data.eos)) badges.appendChild(makeBadge((data.eos <= 6) ? 'ok' : 'warn', `Eosinophils: ${data.eos}%`));
  if (data.org) badges.appendChild(makeBadge('warn', `Culture: ${data.org}`));
  const r = classifyRisk(riskPts);
  badges.appendChild(makeBadge(r.cls, `Risk: ${r.label}`));
}

function analyze(){
  const data = collectData();
  const risk = computeRiskScore({
    temp: data.temp, hr: data.hr, rr: data.rr, spo2: data.spo2, bp: data.bp,
    egfr: data.egfr, crp: data.crp, pct: data.pct,
    org: data.org, bc_repeat: data.bc_repeat, bc_spec: data.bc_spec,
    eos: data.eos, alp: data.alp, bili: data.bili,
    sx_itch: data.sx.itch, sx_confusion: data.sx.confusion, sx_lowbp: data.sx.lowbp, sx_sob: data.sx.sob
  });
  renderRisk(risk.pts);
  renderBadges(data, risk.pts);
  $('output').textContent = buildSummary(data, risk);
}

// PWA install prompt + SW
let deferredPrompt = null;
function setupPWA(){
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('installBtn').textContent = 'Install';
  });

  $('installBtn').addEventListener('click', async () => {
    if(!deferredPrompt){
      alert('Install prompt not available. On mobile: browser menu → “Add to Home Screen”.');
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });

  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}

// Timeline
const timeline = new Timeline('trendCanvas');
function wireTimeline(){
  const addBtn = $('addPointBtn');
  if(!addBtn) return;
  addBtn.addEventListener('click', () => {
    const p = {
      date: $('t_date').value || new Date().toISOString().slice(0,10),
      label: $('t_label').value.trim(),
      egfr: Number($('t_egfr').value),
      creat: Number($('t_creat').value)
    };
    timeline.addPoint(p);
    timeline.render();
  });
  $('clearTimelineBtn').addEventListener('click', () => {
    if(!confirm('Clear all timeline points?')) return;
    timeline.clear();
    timeline.render();
  });
  timeline.render();
}

// Optional GPT
function wireGPT(){
  const btn = $('askGptBtn');
  if(!btn) return;
  btn.addEventListener('click', async () => {
    analyze();
    const url = $('proxyUrl').value.trim();
    if(!url){ $('gptReply').textContent = 'Add a proxy URL first.'; return; }
    $('gptReply').textContent = 'Calling GPT proxy…';
    try{
      const reply = await askGPT(url, $('output').textContent);
      $('gptReply').textContent = reply;
    }catch(e){
      $('gptReply').textContent = 'Proxy call failed: ' + (e?.message || String(e));
    }
  });
}

function wireExample(){
  $('loadExampleBtn').addEventListener('click', () => {
    $('age').value = '60';
    $('sex').value = 'Male';
    $('egfr').value = '84';
    $('creat').value = '1.10';
    $('urea').value = '14.4';
    $('bicarb').value = '20';
    $('wbc').value = '7.6';
    $('hb').value = '13.0';
    $('plt').value = '299';
    $('eos').value = '7.0';
    $('sx_itch').checked = true;
    $('sx_insomnia').checked = true;
    $('sx_ed').checked = true;
    $('notes').value = 'Itching stopped for now; infection not yet treated; insomnia; erectile changes. (Demo)';
    analyze();
  });
}

function wireAnalyze(){ $('analyzeBtn').addEventListener('click', analyze); }

function enforceMode(){
  const accepted = localStorage.getItem(LS.disclaimerAccepted) === '1';
  if (!accepted) return;
  const mode = localStorage.getItem(LS.mode) || 'patient';
  const unlocked = sessionStorage.getItem(LS.doctorUnlocked) === '1';
  if (mode === 'doctor' && !unlocked){
    localStorage.setItem(LS.mode, 'patient');
    setModeUI('patient');
  } else {
    setModeUI(mode);
  }
}

function init(){
  // init pills
  $('countryPill').textContent = $('country').value;
  $('builtBy').textContent = $('brandTag').textContent;

  wireDisclaimer();
  wirePinGate();
  wireModeButtons();
  wireBrand();
  wireCountry();
  wirePdfCopy();
  wireAnalyze();
  wireExample();
  wireTimeline();
  wireGPT();
  applyCountryHints();
  setupPWA();
  renderRisk(0);

  showDisclaimerIfNeeded();
  enforceMode();
}

init();
