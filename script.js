const steps = document.querySelectorAll(".step");
let current = 0;

function activateStep(i){
  steps.forEach(s => s.classList.remove("active"));
  steps[i].classList.add("active");
}

function nextStep(){
  if(current < steps.length - 1){
    current++;
    activateStep(current);
  }
}