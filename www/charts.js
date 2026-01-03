/* charts.js — lightweight, no external deps
   Exposes window.KT_CHARTS with:
   - init(canvas)
   - renderFromTimeline(points)
   - previewPoint(point)
*/
(() => {
  const KT_CHARTS = {};
  let canvas = null;
  let ctx = null;

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  function niceBounds(values){
    const v = values.filter(Number.isFinite);
    if(!v.length) return { min:0, max:1 };
    let min = Math.min(...v);
    let max = Math.max(...v);
    if(min === max){ min -= 1; max += 1; }
    const pad = (max - min) * 0.15;
    return { min: min - pad, max: max + pad };
  }

  function drawAxes(w, h, pad){
    ctx.strokeStyle = "rgba(0,0,0,.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();

    // light grid
    ctx.strokeStyle = "rgba(0,0,0,.06)";
    ctx.beginPath();
    const steps = 5;
    for(let i=1;i<steps;i++){
      const y = pad + (i*(h-2*pad)/steps);
      ctx.moveTo(pad, y);
      ctx.lineTo(w-pad, y);
    }
    ctx.stroke();
  }

  function mapX(i, n, w, pad){
    if(n <= 1) return pad;
    return pad + (i*(w-2*pad)/(n-1));
  }

  function mapY(val, bounds, h, pad){
    if(!Number.isFinite(val)) return null;
    const t = (val - bounds.min) / (bounds.max - bounds.min);
    return (h - pad) - t*(h - 2*pad);
  }

  function drawLine(points, key, bounds, w, h, pad){
    ctx.beginPath();
    let started = false;
    for(let i=0;i<points.length;i++){
      const y = mapY(points[i][key], bounds, h, pad);
      if(y === null) continue;
      const x = mapX(i, points.length, w, pad);
      if(!started){ ctx.moveTo(x,y); started = true; }
      else{ ctx.lineTo(x,y); }
    }
    ctx.stroke();
  }

  function drawLegend(items, x, y){
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    let yy = y;
    items.forEach(it => {
      ctx.fillStyle = it.color;
      ctx.fillRect(x, yy-8, 10, 10);
      ctx.fillStyle = "rgba(0,0,0,.75)";
      ctx.fillText(it.label, x+14, yy+1);
      yy += 16;
    });
  }

  function render(points){
    if(!ctx) return;
    const w = canvas.width, h = canvas.height;
    const pad = 50;

    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,w,h);

    drawAxes(w,h,pad);

    // Separate bounds per metric (overlayed, normalized-ish by separate Y??)
    // For clarity: we draw two panels: top for eGFR/Creatinine, bottom for CRP/Risk.
    const mid = Math.floor(h*0.56);

    // Top panel
    ctx.save();
    ctx.beginPath(); ctx.rect(0,0,w,mid); ctx.clip();
    const egfrBounds = niceBounds(points.map(p => p.egfr));
    const creatBounds = niceBounds(points.map(p => p.creat));

    ctx.lineWidth = 2;

    // eGFR
    ctx.strokeStyle = "rgba(11,107,47,.95)";
    drawLine(points,"egfr",egfrBounds,w,mid,pad);

    // creatinine (scaled to its own bounds, but drawn in same panel — imperfect but usable)
    ctx.strokeStyle = "rgba(176,0,32,.95)";
    drawLine(points,"creat",creatBounds,w,mid,pad);

    ctx.fillStyle = "rgba(0,0,0,.7)";
    ctx.font = "13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Trend (top): eGFR (green) + Creatinine (red)", pad, 22);

    drawLegend([
      {label:"eGFR", color:"rgba(11,107,47,.95)"},
      {label:"Creatinine", color:"rgba(176,0,32,.95)"}
    ], w - pad - 150, 36);
    ctx.restore();

    // Divider
    ctx.strokeStyle = "rgba(0,0,0,.08)";
    ctx.beginPath();
    ctx.moveTo(pad, mid);
    ctx.lineTo(w-pad, mid);
    ctx.stroke();

    // Bottom panel
    ctx.save();
    ctx.beginPath(); ctx.rect(0,mid,w,h-mid); ctx.clip();
    const crpBounds = niceBounds(points.map(p => p.crp));
    const riskBounds = { min:0, max:20 };

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(179,107,0,.95)"; // CRP
    drawLine(points,"crp",crpBounds,w,h,pad);

    ctx.strokeStyle = "rgba(17,17,17,.9)"; // Risk
    drawLine(points,"risk",riskBounds,w,h,pad);

    ctx.fillStyle = "rgba(0,0,0,.7)";
    ctx.font = "13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Trend (bottom): CRP (amber) + Risk score (black)", pad, mid + 22);

    drawLegend([
      {label:"CRP", color:"rgba(179,107,0,.95)"},
      {label:"Risk", color:"rgba(17,17,17,.9)"}
    ], w - pad - 150, mid + 36);
    ctx.restore();

    // X labels
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    const n = points.length;
    if(n){
      const a = new Date(points[0].ts).toLocaleDateString();
      const b = new Date(points[n-1].ts).toLocaleDateString();
      ctx.fillText(a, pad, h - 14);
      ctx.fillText(b, w - pad - ctx.measureText(b).width, h - 14);
    }
  }

  KT_CHARTS.init = (c) => {
    canvas = c;
    ctx = canvas.getContext("2d");
    // make crisp on high-dpi
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width;
    const cssH = canvas.height;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.scale(dpr, dpr);
    render([]);
  };

  KT_CHARTS.renderFromTimeline = (points) => {
    const p = (points || []).slice().sort((a,b) => (a.ts||"").localeCompare(b.ts||""));
    render(p);
  };

  KT_CHARTS.previewPoint = (point) => {
    // Draw a faint preview if timeline is empty or before switching tabs.
    const pts = (window.KT_TIMELINE && window.KT_TIMELINE.getAll) ? window.KT_TIMELINE.getAll() : [];
    const merged = pts.concat([point]).slice(-30);
    KT_CHARTS.renderFromTimeline(merged);
  };

  window.KT_CHARTS = KT_CHARTS;
})();
