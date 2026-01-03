// timeline.js — simple canvas trend (no external libs)
export class Timeline {
  constructor(canvasId){
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.points = [];
  }

  addPoint(p){
    const date = p.date || new Date().toISOString().slice(0,10);
    const point = {
      date,
      label: p.label || "",
      egfr: isFinite(p.egfr) ? p.egfr : null,
      creat: isFinite(p.creat) ? p.creat : null
    };
    this.points.push(point);
    this.points.sort((a,b) => a.date.localeCompare(b.date));
  }

  clear(){ this.points = []; }

  render(){
    const c = this.canvas;
    const ctx = this.ctx;

    // HiDPI
    const dpr = window.devicePixelRatio || 1;
    const W = 900, H = 260;
    c.width = Math.floor(W * dpr);
    c.height = Math.floor(H * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,W,H);

    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillStyle = "#111";
    ctx.fillText("Trend plot (educational): eGFR & Creatinine (scaled)", 12, 18);

    if (this.points.length < 2){
      ctx.fillStyle = "#444";
      ctx.fillText("Add at least 2 points to see a trend line.", 12, 42);
      return;
    }

    const left = 40, right = W - 10, top = 36, bottom = H - 30;

    // axes
    ctx.strokeStyle = "#ddd";
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    const step = Math.max(1, Math.floor(this.points.length / 5));
    ctx.fillStyle = "#444";
    this.points.forEach((p,i)=>{
      if (i % step !== 0 && i !== this.points.length-1) return;
      const x = left + (i/(this.points.length-1))*(right-left);
      ctx.fillText(p.date.slice(5), x-10, H-10);
    });

    const eg = this.points.map(p=>p.egfr).filter(v=>v!==null);
    const cr = this.points.map(p=>p.creat).filter(v=>v!==null);

    const mm = (arr) => {
      const mn = Math.min(...arr);
      const mx = Math.max(...arr);
      return { mn, mx, span: (mx-mn) || 1 };
    };
    const egMM = mm(eg.length?eg:[0,1]);
    const crMM = mm(cr.length?cr:[0,1]);

    const yScaled = (v, m) => bottom - ((v - m.mn)/m.span) * (bottom-top);

    const drawSeries = (key, m, color, label, yLabel) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      this.points.forEach((p,i)=>{
        const v = p[key];
        if (v === null) return;
        const x = left + (i/(this.points.length-1))*(right-left);
        const y = yScaled(v, m);
        if (!started){ ctx.moveTo(x,y); started=true; }
        else ctx.lineTo(x,y);
      });
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.fillText(`${label} (scaled)`, 650, yLabel);
      ctx.fillStyle = "#111";
      ctx.fillText(`min ${m.mn} / max ${m.mx}`, 780, yLabel);
    };

    drawSeries("egfr", egMM, "#0b6b2f", "eGFR", 18);
    drawSeries("creat", crMM, "#b00020", "Creatinine", 32);

    // points
    this.points.forEach((p,i)=>{
      const x = left + (i/(this.points.length-1))*(right-left);
      if (p.egfr !== null){
        ctx.fillStyle = "#0b6b2f";
        ctx.beginPath(); ctx.arc(x, yScaled(p.egfr, egMM), 3, 0, Math.PI*2); ctx.fill();
      }
      if (p.creat !== null){
        ctx.fillStyle = "#b00020";
        ctx.beginPath(); ctx.arc(x, yScaled(p.creat, crMM), 3, 0, Math.PI*2); ctx.fill();
      }
    });
  }
}
