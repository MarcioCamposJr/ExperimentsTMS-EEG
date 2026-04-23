import { updateStatusIndicator, fetchAndPopulateDropdown, handleDeviceConnection, checkDeviceStatus } from '/utils/updateStates.js';

const TASK_CONFIG = [
    { id: 'finger_tapping', name: 'Finger Tapping', hasMovementTypes: true },
];

// ===== STATE =====
let phaseState = {
    rest: { duration: 5, jitter: 0, pulse: { enabled: false, points: [{ position: 500, jitter: 0 }] } },
    prep: { duration: 3, jitter: 0, pulse: { enabled: false, points: [{ position: 500, jitter: 0 }] } },
    task: { duration: 5, jitter: 0, pulse: { enabled: false, points: [{ position: 500, jitter: 0 }] }, taskTypes: ['Mão Direita'] }
};

let triggerCodes = {
    rest: 1, prep: 2, task_right: 3, task_left: 4, task_bilateral: 5, tms_pulse: 10
};

let currentModalPhase = null;
let isTmsActive = false;

document.addEventListener('DOMContentLoaded', async () => {
    const taskListContainer = document.getElementById('task-list');
    const numTrials = document.getElementById('num-trials');
    const randomizeToggle = document.getElementById('randomize-toggle');
    const seedGroup = document.getElementById('seed-group');
    const seedValue = document.getElementById('seed-value');
    const trialCountDisplay = document.getElementById('trial-count-display');

    // Phase modal refs
    const modalOverlay = document.getElementById('modal-overlay');
    const modalDot = document.getElementById('modal-dot');
    const modalTitle = document.getElementById('modal-title');
    const modalDuration = document.getElementById('modal-duration');
    const modalJitter = document.getElementById('modal-jitter');
    const modalTaskTypes = document.getElementById('modal-task-types');
    const modalPulseEnabled = document.getElementById('modal-pulse-enabled');
    const pulseCountGroup = document.getElementById('pulse-count-group');
    const modalPulseCount = document.getElementById('modal-pulse-count');
    const pulseRowsContainer = document.getElementById('pulse-rows-container');

    // Trigger modal ref
    const triggerModalOverlay = document.getElementById('trigger-modal-overlay');

    // Navigation modal ref
    const navModalOverlay = document.getElementById('nav-modal-overlay');

    const startButton = document.getElementById('start-button');
    const tmsToggleButton = document.getElementById('tms-toggle-button');

    // Hardware status refs (new card structure)
    const triggerIndicator = document.querySelector('#trigger-hw .hw-card-status .status-indicator');
    const triggerText = document.querySelector('#trigger-hw .hw-card-status .status-text');
    const tmsIndicator = document.querySelector('#tms-hw .hw-card-status .status-indicator');
    const tmsText = document.querySelector('#tms-hw .hw-card-status .status-text');

    // Navigation status — in TMS card row AND in modal
    const navIndicator = document.querySelector('#nav-hw .status-indicator');
    const navText = document.querySelector('#nav-hw .status-text');
    const navModalIndicator = document.getElementById('nav-modal-indicator');
    const navModalText = document.getElementById('nav-modal-text');

    // ===== DIAGRAM =====
    function updateDiagram() {
        for (const phase of ['rest', 'prep', 'task']) {
            const s = phaseState[phase];
            const timeLabel = document.getElementById(`${phase}-time-label`);
            let txt = `${s.duration}s`;
            if (s.jitter > 0) txt += ` ± ${s.jitter}s`;
            timeLabel.textContent = txt;

            const pulseLabel = document.getElementById(`${phase}-pulse-label`);
            if (s.pulse.enabled && s.pulse.points.length > 0) {
                pulseLabel.textContent = `⚡ × ${s.pulse.points.length}`;
            } else {
                pulseLabel.textContent = '—';
            }

            const track = document.getElementById(`${phase}-timeline`).querySelector('.timeline-track');
            track.querySelectorAll('.timeline-region, .timeline-marker').forEach(el => el.remove());

            if (s.pulse.enabled && s.duration > 0) {
                const durMs = s.duration * 1000;
                for (const p of s.pulse.points) {
                    const centerPct = Math.min(98, Math.max(1, (p.position / durMs) * 100));
                    if (p.jitter > 0) {
                        const leftPct = Math.max(0, ((p.position - p.jitter) / durMs) * 100);
                        const rightPct = Math.min(100, ((p.position + p.jitter) / durMs) * 100);
                        const region = document.createElement('div');
                        region.className = 'timeline-region';
                        region.style.left = `${leftPct}%`;
                        region.style.width = `${Math.max(2, rightPct - leftPct)}%`;
                        track.appendChild(region);
                    }
                    const marker = document.createElement('div');
                    marker.className = 'timeline-marker';
                    marker.style.left = `${centerPct}%`;
                    track.appendChild(marker);
                }
            }
        }
        trialCountDisplay.textContent = numTrials.value;
    }

    // ===== PHASE MODAL =====
    const phaseNames = { rest: 'Repouso', prep: 'Preparo', task: 'Tarefa' };
    const phaseColors = { rest: '#7a7a85', prep: '#e6b800', task: '#00BFFF' };

    function renderPulseRows(count) {
        pulseRowsContainer.innerHTML = '';
        if (!currentModalPhase) return;
        const points = phaseState[currentModalPhase].pulse.points;
        for (let i = 0; i < count; i++) {
            const existing = points[i] || { position: 500, jitter: 0 };
            const row = document.createElement('div');
            row.className = 'pulse-row';
            row.innerHTML = `
                <span class="pulse-row-label">P${i + 1}</span>
                <div class="form-group">
                    <label>Posição (ms)</label>
                    <input type="number" class="pulse-pos-input" data-index="${i}" value="${existing.position}" min="0">
                </div>
                <div class="form-group">
                    <label>Jitter ±(ms)</label>
                    <input type="number" class="pulse-jitter-input" data-index="${i}" value="${existing.jitter}" min="0">
                </div>
            `;
            pulseRowsContainer.appendChild(row);
        }
    }

    function openPhaseModal(phase) {
        currentModalPhase = phase;
        const s = phaseState[phase];
        modalDot.style.background = phaseColors[phase];
        modalTitle.textContent = `Configurar ${phaseNames[phase]}`;
        modalDuration.value = s.duration;
        modalJitter.value = s.jitter;
        modalPulseEnabled.checked = s.pulse.enabled;
        const showPulse = s.pulse.enabled;
        pulseCountGroup.style.display = showPulse ? 'flex' : 'none';
        pulseRowsContainer.style.display = showPulse ? 'flex' : 'none';
        modalPulseCount.value = s.pulse.points.length;
        if (showPulse) renderPulseRows(s.pulse.points.length);
        if (phase === 'task') {
            modalTaskTypes.style.display = 'block';
            document.querySelectorAll('input[name="modal-task-type"]').forEach(cb => {
                cb.checked = s.taskTypes?.includes(cb.value) || false;
            });
        } else {
            modalTaskTypes.style.display = 'none';
        }
        modalOverlay.classList.add('active');
    }

    function closePhaseModal() {
        modalOverlay.classList.remove('active');
        currentModalPhase = null;
    }

    function savePhaseModal() {
        if (!currentModalPhase) return;
        const s = phaseState[currentModalPhase];
        s.duration = parseFloat(modalDuration.value) || 0;
        s.jitter = parseFloat(modalJitter.value) || 0;
        s.pulse.enabled = modalPulseEnabled.checked;
        if (s.pulse.enabled) {
            const posInputs = pulseRowsContainer.querySelectorAll('.pulse-pos-input');
            const jitterInputs = pulseRowsContainer.querySelectorAll('.pulse-jitter-input');
            s.pulse.points = [];
            for (let i = 0; i < posInputs.length; i++) {
                s.pulse.points.push({
                    position: parseFloat(posInputs[i].value) || 0,
                    jitter: parseFloat(jitterInputs[i].value) || 0,
                });
            }
        }
        if (currentModalPhase === 'task') {
            s.taskTypes = Array.from(document.querySelectorAll('input[name="modal-task-type"]:checked')).map(cb => cb.value);
        }
        updateDiagram();
        closePhaseModal();
    }

    document.querySelectorAll('.phase-block').forEach(block => {
        block.addEventListener('click', () => openPhaseModal(block.dataset.phase));
    });
    document.getElementById('modal-close').addEventListener('click', closePhaseModal);
    document.getElementById('modal-cancel').addEventListener('click', closePhaseModal);
    document.getElementById('modal-save').addEventListener('click', savePhaseModal);
    modalPulseEnabled.addEventListener('change', () => {
        const show = modalPulseEnabled.checked;
        pulseCountGroup.style.display = show ? 'flex' : 'none';
        pulseRowsContainer.style.display = show ? 'flex' : 'none';
        if (show) renderPulseRows(parseInt(modalPulseCount.value) || 1);
    });
    modalPulseCount.addEventListener('input', () => {
        renderPulseRows(Math.max(1, Math.min(10, parseInt(modalPulseCount.value) || 1)));
    });

    // ===== TRIGGER CODES MODAL =====
    function openTriggerModal() {
        document.getElementById('tc-rest').value = triggerCodes.rest;
        document.getElementById('tc-prep').value = triggerCodes.prep;
        document.getElementById('tc-task-right').value = triggerCodes.task_right;
        document.getElementById('tc-task-left').value = triggerCodes.task_left;
        document.getElementById('tc-task-bilateral').value = triggerCodes.task_bilateral;
        document.getElementById('tc-tms-pulse').value = triggerCodes.tms_pulse;
        triggerModalOverlay.classList.add('active');
    }
    function closeTriggerModal() { triggerModalOverlay.classList.remove('active'); }
    function saveTriggerModal() {
        triggerCodes.rest = parseInt(document.getElementById('tc-rest').value) || 1;
        triggerCodes.prep = parseInt(document.getElementById('tc-prep').value) || 2;
        triggerCodes.task_right = parseInt(document.getElementById('tc-task-right').value) || 3;
        triggerCodes.task_left = parseInt(document.getElementById('tc-task-left').value) || 4;
        triggerCodes.task_bilateral = parseInt(document.getElementById('tc-task-bilateral').value) || 5;
        triggerCodes.tms_pulse = parseInt(document.getElementById('tc-tms-pulse').value) || 10;
        closeTriggerModal();
    }
    document.getElementById('trigger-config-btn').addEventListener('click', openTriggerModal);
    document.getElementById('trigger-modal-close').addEventListener('click', closeTriggerModal);
    document.getElementById('trigger-modal-cancel').addEventListener('click', closeTriggerModal);
    document.getElementById('trigger-modal-save').addEventListener('click', saveTriggerModal);

    // ===== NAVIGATION MODAL =====
    function openNavModal() { navModalOverlay.classList.add('active'); }
    function closeNavModal() { navModalOverlay.classList.remove('active'); }

    document.getElementById('nav-config-btn').addEventListener('click', openNavModal);
    document.getElementById('nav-modal-close').addEventListener('click', closeNavModal);
    document.getElementById('nav-modal-done').addEventListener('click', closeNavModal);

    // Sync nav status between card row and modal
    function updateNavStatus(indicator, text) {
        // Also update the inline nav status in TMS card
        if (indicator) {
            const isConnected = indicator.classList.contains('connected');
            navIndicator.className = indicator.className;
            navText.textContent = 'Nav: ' + (isConnected ? 'Conectado' : 'Desconectado');
        }
    }

    document.getElementById('connect-buttom-navigation').addEventListener('click', async () => {
        const val = document.getElementById('nav-system-link').value;
        const [addr, port] = val.replace('http://', '').split(':');
        await handleDeviceConnection('/connect-navigation', {
            address: addr, port: parseInt(port)
        }, navModalIndicator, navModalText, 'Conectado', 'Desconectado');
        // Sync to card
        const isConn = navModalIndicator.classList.contains('connected');
        navIndicator.classList.toggle('connected', isConn);
        navText.textContent = 'Nav: ' + (isConn ? 'Conectado' : 'Desconectado');
    });

    // ===== HEADER CONTROLS =====
    randomizeToggle.addEventListener('change', () => {
        seedGroup.style.display = randomizeToggle.checked ? 'flex' : 'none';
        if (!randomizeToggle.checked) seedValue.value = '';
    });
    numTrials.addEventListener('input', () => { trialCountDisplay.textContent = numTrials.value; });

    // ===== TASK BUTTONS =====
    function initializeTaskButtons() {
        taskListContainer.innerHTML = '';
        TASK_CONFIG.forEach((task, i) => {
            const btn = document.createElement('button');
            btn.className = 'task-button';
            btn.textContent = task.name;
            btn.dataset.taskId = task.id;
            if (i === 0) btn.classList.add('selected');
            btn.addEventListener('click', () => {
                document.querySelectorAll('.task-button').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
            taskListContainer.appendChild(btn);
        });
    }

    // ===== HARDWARE =====
    document.getElementById('connect-buttom-trigger').addEventListener('click', async () => {
        await handleDeviceConnection('/connect-trigger', {
            port: document.getElementById('arduino-port').value,
            boudrate: parseInt(document.getElementById('arduino-baudrate').value || 115200)
        }, triggerIndicator, triggerText, 'Conectado', 'Desconectado');
    });

    document.getElementById('connect-buttom-tms').addEventListener('click', async () => {
        const sel = document.getElementById('tms-port');
        await handleDeviceConnection('/connect-tms', {
            port: sel.value, port_name: sel.options[sel.selectedIndex]?.textContent || ''
        }, tmsIndicator, tmsText, 'Conectado', 'Desconectado');
    });

    tmsToggleButton.addEventListener('click', async () => {
        isTmsActive = !isTmsActive;
        try {
            const resp = await fetch('/enable-tms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enable: isTmsActive })
            });
            if (!resp.ok) { isTmsActive = !isTmsActive; return; }
            tmsToggleButton.textContent = isTmsActive ? 'Desativar TMS' : 'Ativar TMS';
            tmsToggleButton.classList.toggle('active', isTmsActive);
        } catch (e) { isTmsActive = !isTmsActive; console.error(e); }
    });

    document.getElementById('tms-intensity-btn').addEventListener('click', async () => {
        const intensity = parseInt(document.getElementById('tms-intensity').value) || 50;
        try {
            await fetch('/set-tms-intensity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intensity })
            });
        } catch (e) { console.error('Erro ao setar intensidade:', e); }
    });

    // ===== START =====
    startButton.addEventListener('click', async () => {
        const ts = phaseState.task;
        let movementType = 'Unilateral';
        const selected = ts.taskTypes || ['Mão Direita'];
        if (selected.length === 1) movementType = selected[0];
        else if (selected.length > 1) movementType = 'Misto';
        else { movementType = 'Mão Direita'; selected.push('Mão Direita'); }

        function buildPulseConfig(phase) {
            const p = phaseState[phase].pulse;
            return {
                enabled: p.enabled,
                pulses: p.points.map(pt => ({ position_ms: pt.position, jitter_ms: pt.jitter }))
            };
        }

        const config = {
            task_type: document.querySelector('.task-button.selected')?.dataset.taskId || 'finger_tapping',
            num_trials: parseInt(numTrials.value) || 10,
            randomize: randomizeToggle.checked,
            seed: seedValue.value ? parseInt(seedValue.value) : null,
            rest: { duration_seconds: phaseState.rest.duration, jitter_seconds: phaseState.rest.jitter },
            prep: { duration_seconds: phaseState.prep.duration, jitter_seconds: phaseState.prep.jitter },
            task: { duration_seconds: phaseState.task.duration, jitter_seconds: phaseState.task.jitter },
            pulse_rest: buildPulseConfig('rest'),
            pulse_prep: buildPulseConfig('prep'),
            pulse_task: buildPulseConfig('task'),
            movement_type: movementType,
            mixed_task_types: selected,
            tms_intensity: parseInt(document.getElementById('tms-intensity').value) || 50,
            trigger_codes: { ...triggerCodes },
        };

        try {
            const resp = await fetch('/set-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (!resp.ok) throw new Error(`${resp.status}`);
            window.location.href = '/monitor';
        } catch (e) { console.error('Erro:', e); }
    });

    // ===== INIT =====
    try {
        const defResp = await fetch('/default-config');
        if (defResp.ok) {
            const defJson = await defResp.json();
            if (defJson.num_trials) numTrials.value = defJson.num_trials;
            if (defJson.tms_intensity) document.getElementById('tms-intensity').value = defJson.tms_intensity;
            if (defJson.randomize !== undefined) {
                randomizeToggle.checked = defJson.randomize;
                seedGroup.style.display = defJson.randomize ? 'flex' : 'none';
            }
            if (defJson.seed) seedValue.value = defJson.seed;

            if (defJson.trigger_codes) triggerCodes = { ...triggerCodes, ...defJson.trigger_codes };
            if (defJson.phases) {
                // Ensure pulse points are structured properly
                for (const phaseKey of ['rest', 'prep', 'task']) {
                    if (defJson.phases[phaseKey]) {
                        phaseState[phaseKey] = { ...phaseState[phaseKey], ...defJson.phases[phaseKey] };
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Nenhum default_config.json encontrado ou erro de parse:", e);
    }

    try {
        await fetchAndPopulateDropdown('/ports-tms', document.getElementById('tms-port'), 'name', 'description');
        await checkDeviceStatus('/get-connection-tms', tmsIndicator, tmsText, 'Conectado', 'Desconectado', { 'tms-port': 'port' });
        await fetchAndPopulateDropdown('/ports-trigger', document.getElementById('arduino-port'));
        await checkDeviceStatus('/get-connection-trigger', triggerIndicator, triggerText, 'Conectado', 'Desconectado', { 'arduino-port': 'port_name', 'arduino-baudrate': 'boudrate' });
        // Navigation — update both inline + modal status
        await checkDeviceStatus('/get-navigation-status', navModalIndicator, navModalText, 'Conectado', 'Desconectado', { 'nav-system-link': (s) => `http://${s.address}:${s.port}` });
        const navConn = navModalIndicator.classList.contains('connected');
        navIndicator.classList.toggle('connected', navConn);
        navText.textContent = 'Nav: ' + (navConn ? 'Conectado' : 'Desconectado');

        const tmsResp = await fetch('/get-tms-status');
        if (tmsResp.ok) {
            const data = await tmsResp.json();
            isTmsActive = data.is_active;
            tmsToggleButton.textContent = isTmsActive ? 'Desativar TMS' : 'Ativar TMS';
            tmsToggleButton.classList.toggle('active', isTmsActive);
        }
    } catch (e) { console.error("Erro na carga inicial:", e); }

    initializeTaskButtons();
    updateDiagram();
});
