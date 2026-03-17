import { updateStatusIndicator, fetchAndPopulateDropdown, handleDeviceConnection, checkDeviceStatus } from '/utils/updateStates.js';

const TASK_CONFIG = [
    {
        id: 'finger_tapping',
        name: 'Finger Tapping',
        trialTypes: ['Unilateral', 'Bilateral', 'Bilateral Simultâneo']
    },
]

document.addEventListener('DOMContentLoaded', async () => {
    const taskListContainer = document.querySelector('.task-list');
    const trialTypeGroup = document.getElementById('trial-type-gruop');
    const trialTypeSelect = document.getElementById('trial-type');

    const arduinoPort= document.getElementById('arduino-port');
    const arduinoBaudrate = document.getElementById('arduino-baudrate');
    const triggerConnectButtom = document.querySelector('.arduino-settings .connect-button');
    const triggerStatusIndicator = document.querySelector('.arduino-settings .status-indicator');
    const triggerStatusText = document.querySelector('.arduino-settings .status-text');

    const tmsPort = document.getElementById('tms-port');
    const tmsConnectButtom = document.getElementById('connect-buttom-tms');
    const tmsStatusIndicator = document.querySelector('.tms-settings .status-indicator');
    const tmsStatusText = document.querySelector('.tms-settings .status-text');

    const tmsStartButton = document.querySelector('.tms-toggle-button');

    const navigationLink = document.getElementById("nav-system-link");
    const navigationButton = document.getElementById("connect-buttom-navigation");
    const navigationStatusIndicator = document.querySelector('.navigation-system-content .status-indicator');
    const navigationStatusText = document.querySelector('.navigation-system-content .status-text');

    const startButton = document.querySelector('.start-button'); 

    let isTmsActive = false;

    function updateTmsButtonState() {
        if (isTmsActive) {
            tmsStartButton.classList.add('active');
            tmsStartButton.textContent = 'Desativar TMS';
        } else {
            tmsStartButton.classList.remove('active');
            tmsStartButton.textContent = 'Ativar TMS';
        }
    }

    function updateUIForTask(taskId){
        const selectedTask = TASK_CONFIG.find(task => task.id === taskId);

        if(!selectedTask){
            console.error('Configuração de tarefa não encontrada');
            return
        }
        // Os checkboxes agora são estáticos no HTML, então apenas mostramos/escondemos o grupo
        if(selectedTask.trialTypes.length > 0){
            trialTypeGroup.style.display = 'block';
        }else {
            trialTypeGroup.style.display = 'none';
        }
    }

    function initializeTaskButtons(){
        taskListContainer.innerHTML = '';

        TASK_CONFIG.forEach((task, index) => {
            const button = document.createElement('button');
            button.className = 'task-button';
            button.textContent = task.name;
            button.dataset.taskId = task.id;
            
            if (index === 0){
                button.classList.add('selected');
            }
            
            button.addEventListener('click', () => {
                document.querySelectorAll('.task-button').forEach(btn => btn.classList.remove('selected'));
                button.classList.add('selected');
                updateUIForTask(task.id);
            });
            taskListContainer.appendChild(button);
        });
    }

    // --- Event Listeners ---

    triggerConnectButtom.addEventListener('click', async () => {
        const config = {
            port: arduinoPort.value,
            boudrate: parseInt(arduinoBaudrate.value || 9600)
        };
        await handleDeviceConnection('/connect-trigger', config, triggerStatusIndicator, triggerStatusText, 'Conectado', 'Desconectado');
    });

    tmsConnectButtom.addEventListener('click', async () => {
        const config = {
            port: tmsPort.value,
            port_name: tmsPort.options[tmsPort.selectedIndex].textContent
        };
        await handleDeviceConnection('/connect-tms', config, tmsStatusIndicator, tmsStatusText, 'Conectado', 'Desconectado');
    });

    navigationButton.addEventListener('click', async () => {
        const navLinkValue = navigationLink.value;
        const [address, port] = navLinkValue.replace('http://', '').split(':');
        const config = {
            address: address,
            port: parseInt(port)
        };
        await handleDeviceConnection('/connect-navigation', config, navigationStatusIndicator, navigationStatusText, 'Conectado', 'Desconectado');
    });

    startButton.addEventListener('click', async () => {
        const selectedCheckboxes = document.querySelectorAll('input[name="task-type"]:checked');
        const selectedTasks = Array.from(selectedCheckboxes).map(cb => cb.value);

        let movementType = 'Unilateral';
        if (selectedTasks.length === 1) {
            movementType = selectedTasks[0];
        } else if (selectedTasks.length > 1) {
            movementType = 'Misto';
        } else {
            // Default caso nenhum selecionado
            movementType = 'Mão Direita';
            selectedTasks.push('Mão Direita');
        }

        const config = {
            num_trials: parseInt(document.getElementById('num-trials').value || 10),
            task_duration_seconds: parseInt(document.getElementById('trial-duration').value || 5),
            rest_duration_seconds: parseInt(document.getElementById('trial-duration').value || 5),
            prep_duration_seconds: parseInt(document.getElementById('prep-duration').value || 3),
            movement_type: movementType,
            mixed_task_types: selectedTasks,
            tms_time_min: parseInt(document.getElementById('tms-stim-time-min').value || 0),
            tms_time_max: parseInt(document.getElementById('tms-stim-time-max').value || 0),
            tms_time: 0 // Fallback
        };
        
        try{
            const response = await fetch('/set-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json', 
                },
                body: JSON.stringify(config) 
            });
            if (!response.ok) {
                throw new Error(`Erro ao enviar configuração: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            console.log('Resposta do servidor:', data);
            window.location.href ='/monitor';
        }catch (error) {
            console.error('Erro ao enviar configuração:', error);
        }
    });

    tmsStartButton.addEventListener('click', async () => {
        isTmsActive = !isTmsActive;
        const config = {'enable': isTmsActive};
        try {
            const response = await fetch('/enable-tms',{
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json', 
                },
                body: JSON.stringify(config) 
            });
            if (!response.ok) {
                isTmsActive = !isTmsActive; // Revert state on error
                throw new Error(`Erro ao buscar dados: ${response.status} ${response.statusText}`);
            }
            updateTmsButtonState();
        }catch (error) {
            console.error('Erro ao enviar configuração:', error);
        }
    });

    // --- Initial Load and Checks ---

    const checkTMSEnable = async() =>{
        try {
            const response = await fetch('/get-tms-status');
            if (response.ok) {
                const data = await response.json();
                isTmsActive = data.is_active;
            }
            updateTmsButtonState();
        }catch (error) {
            console.error('Erro ao enviar configuração:', error);
        }

    }

    try {
        await fetchAndPopulateDropdown('/ports-tms', tmsPort, 'name', 'description');
        await checkDeviceStatus('/get-connection-tms', tmsStatusIndicator, tmsStatusText, 'Conectado', 'Desconectado', { 'tms-port': 'port' });
        await fetchAndPopulateDropdown('/ports-trigger', arduinoPort);
        await checkDeviceStatus('/get-connection-trigger', triggerStatusIndicator, triggerStatusText, 'Conectado', 'Desconectado', { 'arduino-port': 'port_name', 'arduino-baudrate': 'boudrate' });
        await checkDeviceStatus('/get-navigation-status', navigationStatusIndicator, navigationStatusText, 'Conectado', 'Desconectado', { 'nav-system-link': (status) => `http://${status.address}:${status.port}` });
        await checkTMSEnable();
    } catch (error) {
        console.error("Erro durante a carga inicial ou verificação de conexão:", error);
    } finally {
        initializeTaskButtons();
        if(TASK_CONFIG.length > 0){
            updateUIForTask(TASK_CONFIG[0].id);
        }
    }
});
