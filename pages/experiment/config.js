document.addEventListener('DOMContentLoaded', ()=>{
    const handleStimulus = (isRunning, instruction, phase, target) => {
        const handLeft = document.getElementById('hand-left');
        const handRight = document.getElementById('hand-right');
        const cross = document.getElementById('focus-cross');

        // Logic to determine active hands based on target (1=Right, 2=Left, 3=Bilateral)
        let isLeftActive = (target === 2 || target === 3);
        let isRightActive = (target === 1 || target === 3);

        if (isRunning) {
            // Apply hands opacity based on active state (only active during prep and task)
            if (phase === 'prep' || phase === 'task') {
                handLeft.classList.toggle('active', isLeftActive);
                handRight.classList.toggle('active', isRightActive);
            } else {
                handLeft.classList.remove('active');
                handRight.classList.remove('active');
            }

            // Cross turns red only during task phase
            cross.classList.toggle('active', phase === 'task');
        } else {
            handLeft.classList.remove('active');
            handRight.classList.remove('active');
            cross.classList.remove('active');
        }
    };

    const updateStimulus = async() => {
        try {
            const response = await fetch('/stimulus-exp');
            const data = await response.json();
            handleStimulus(data.is_running, data.instruction, data.phase, data.target);
        } catch (error) {
            console.error("Erro ao buscar estímulo:", error);
        }
    };

    function connect() {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        console.log(`${proto}://${location.host}/ws/stimulus`);
        const ws = new WebSocket(`${proto}://${location.host}/ws/stimulus`);
        ws.onmessage = (ev) => {
            const { r, c, i, p, t } = JSON.parse(ev.data);
            handleStimulus(r, i, p, t);
            ws.send(JSON.stringify({trigger: true}));
        };
        ws.onclose = () => setTimeout(connect, 500);
    }
    connect();
    updateStimulus();
});