new Chart(document.getElementById("timelineChart"), {
  type: "line",
  data: {
    labels: ["Day 1","Day 3","Day 7"],
    datasets: [{
      label: "Creatinine",
      data: [1.1,1.4,1.2],
      borderColor: "#2563eb",
      tension: 0.4
    }]
  },
  options: {
    responsive:true,
    plugins:{ legend:{display:false} }
  }
});