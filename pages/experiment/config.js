document.addEventListener('DOMContentLoaded', ()=>{
    const circleElement = document.getElementById('stimulus-circle');
    const instructionElement = document.getElementById('instruction-text');
    const countdownElement = document.getElementById('countdown-text');

    const handleStimulus = (isRunning, color, instruction) => {
        if (isRunning) {
            circleElement.style.backgroundColor = color;
            
            // Check for preparation phase (e.g. "Prepare-se... 3")
            if (instruction.startsWith("Prepare-se")) {
                const parts = instruction.split("...");
                instructionElement.textContent = parts[0];
                if (parts.length > 1) {
                    countdownElement.textContent = parts[1].trim();
                    countdownElement.classList.add('active'); // Para animação
                }
            } else {
                instructionElement.textContent = instruction;
                countdownElement.textContent = '';
                countdownElement.classList.remove('active');
            }
        } else {
            circleElement.style.backgroundColor = 'gray';
            instructionElement.textContent = 'Aguarde';
            countdownElement.textContent = '';
            countdownElement.classList.remove('active');
        }
    };

    const updateStimulus = async() => {
        try{

            const response = await fetch('/stimulus-exp');
            const data = await response.json();
            
            handleStimulus(data.is_running, data.color, data.instruction);
        } catch (error) {
            console.error("Erro ao buscar estímulo:", error);
        }
    }

    function connect() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        console.log(`${proto}://${location.host}/ws/stimulus`);
        const ws = new WebSocket(`${proto}://${location.host}/ws/stimulus`);
        ws.onmessage = (ev) => {
            const { r, c, i } = JSON.parse(ev.data);
            handleStimulus(r, c, i);
            ws.send(JSON.stringify({trigger: true}));
        };
        ws.onclose = () => setTimeout(connect, 500);
    }
    connect();
    updateStimulus();
});