class BrainfuckInterpreter {
    constructor() {
        this.memorySize = 30000;
        this.memory = new Uint8Array(this.memorySize);
        this.pointer = 0;
        this.pc = 0; // Program Counter
        this.code = "";
        this.loopStack = [];
        this.output = "";
        this.inputBuffer = [];
        this.isRunning = false;
        this.delay = 50;
        this.stepsPerTick = 1;
        this.timer = null;
        this.instructions = [];
        this.instructionMap = []; // Maps instruction index to original code index
    }

    load(code, input) {
        this.code = code;
        this.inputBuffer = input.split('').map(c => c.charCodeAt(0));
        this.reset();
        this.parseCode();
    }

    reset() {
        this.memory.fill(0);
        this.pointer = 0;
        this.pc = 0;
        this.loopStack = [];
        this.output = "";
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    parseCode() {
        // Filter out non-command characters and build instruction map
        this.instructions = [];
        this.instructionMap = [];
        const validCmds = "><+-.,[]";
        
        for (let i = 0; i < this.code.length; i++) {
            if (validCmds.includes(this.code[i])) {
                this.instructions.push(this.code[i]);
                this.instructionMap.push(i);
            }
        }
    }

    step() {
        if (this.pc >= this.instructions.length) {
            this.isRunning = false;
            return false; // Halted
        }

        const cmd = this.instructions[this.pc];
        
        switch (cmd) {
            case '>':
                this.pointer = (this.pointer + 1) % this.memorySize;
                break;
            case '<':
                this.pointer = (this.pointer - 1 + this.memorySize) % this.memorySize;
                break;
            case '+':
                this.memory[this.pointer] = (this.memory[this.pointer] + 1) & 255;
                break;
            case '-':
                this.memory[this.pointer] = (this.memory[this.pointer] - 1) & 255;
                break;
            case '.':
                this.output += String.fromCharCode(this.memory[this.pointer]);
                break;
            case ',':
                if (this.inputBuffer.length > 0) {
                    this.memory[this.pointer] = this.inputBuffer.shift();
                } else {
                    // If no input, treat as 0 or wait? Standard behavior varies. 
                    // For this visualizer, we'll use 0 (EOF) or just not change if we want to simulate blocking (but blocking is hard in JS loop).
                    // Let's assume 0 for now if empty.
                    this.memory[this.pointer] = 0;
                }
                break;
            case '[':
                if (this.memory[this.pointer] === 0) {
                    let depth = 1;
                    while (depth > 0) {
                        this.pc++;
                        if (this.pc >= this.instructions.length) break;
                        if (this.instructions[this.pc] === '[') depth++;
                        if (this.instructions[this.pc] === ']') depth--;
                    }
                }
                break;
            case ']':
                if (this.memory[this.pointer] !== 0) {
                    let depth = 1;
                    while (depth > 0) {
                        this.pc--;
                        if (this.pc < 0) break;
                        if (this.instructions[this.pc] === ']') depth++;
                        if (this.instructions[this.pc] === '[') depth--;
                    }
                }
                break;
        }

        this.pc++;
        return true;
    }
}

// UI Controller
const interpreter = new BrainfuckInterpreter();
const elements = {
    codeInput: document.getElementById('code-input'),
    codeDisplay: document.getElementById('code-display'),
    tape: document.getElementById('tape'),
    pointerVal: document.getElementById('pointer-val'),
    cellVal: document.getElementById('cell-val'),
    programInput: document.getElementById('program-input'),
    programOutput: document.getElementById('program-output'),
    btnRun: document.getElementById('btn-run'),
    btnStep: document.getElementById('btn-step'),
    btnPause: document.getElementById('btn-pause'),
    btnReset: document.getElementById('btn-reset'),
    speedSlider: document.getElementById('speed-slider')
};

// Constants
const TAPE_VIEW_RADIUS = 15; // How many cells to show around pointer

function init() {
    renderTape();
    setupEventListeners();
    syncCodeDisplay();
}

function autoResize(element) {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
}

function setupEventListeners() {
    elements.btnRun.addEventListener('click', run);
    elements.btnStep.addEventListener('click', step);
    elements.btnPause.addEventListener('click', pause);
    elements.btnReset.addEventListener('click', reset);
    
    elements.codeInput.addEventListener('input', () => {
        syncCodeDisplay();
        autoResize(elements.codeInput);
        reset(); // Reset on code change
    });
    
    // Initial resize
    autoResize(elements.codeInput);
    
    elements.codeInput.addEventListener('scroll', () => {
        elements.codeDisplay.scrollTop = elements.codeInput.scrollTop;
    });

    elements.speedSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (val <= 80) {
            interpreter.delay = Math.max(0, (80 - val) * 10);
            interpreter.stepsPerTick = 1;
        } else {
            interpreter.delay = 0;
            // Exponential growth for steps per tick
            // 81 -> 1
            // 90 -> ~357
            // 100 -> ~127482
            interpreter.stepsPerTick = Math.floor(Math.pow(1.8, val - 80));
        }
    });
    
    // Trigger input event to set initial values based on HTML attribute
    elements.speedSlider.dispatchEvent(new Event('input'));
}

function syncCodeDisplay() {
    // Just copy text for now, highlighting happens during execution
    elements.codeDisplay.textContent = elements.codeInput.value;
}

function highlightCode(originalIndex) {
    const code = elements.codeInput.value;
    if (originalIndex === undefined || originalIndex < 0 || originalIndex >= code.length) {
        elements.codeDisplay.textContent = code;
        return;
    }

    const before = code.substring(0, originalIndex);
    const active = code.substring(originalIndex, originalIndex + 1);
    const after = code.substring(originalIndex + 1);

    elements.codeDisplay.innerHTML = '';
    elements.codeDisplay.appendChild(document.createTextNode(before));
    
    const span = document.createElement('span');
    span.className = 'highlight';
    span.textContent = active;
    elements.codeDisplay.appendChild(span);
    
    elements.codeDisplay.appendChild(document.createTextNode(after));
    
    // Auto scroll to keep highlight in view
    // Note: This is tricky with textarea overlay. 
    // We might need to calculate position or just rely on user scrolling if they want to see.
    // For now, simple implementation.
}

function renderTape() {
    elements.tape.innerHTML = '';
    
    // We can't render all 30000 cells. Render a window around the pointer.
    // Or render a fixed set (e.g., 0-50) and scroll?
    // Let's try rendering a window centered on pointer.
    
    const start = Math.max(0, interpreter.pointer - TAPE_VIEW_RADIUS);
    const end = Math.min(interpreter.memorySize, interpreter.pointer + TAPE_VIEW_RADIUS + 1);
    
    for (let i = start; i < end; i++) {
        const cell = document.createElement('div');
        cell.className = `cell ${i === interpreter.pointer ? 'active' : ''}`;
        
        const idx = document.createElement('div');
        idx.className = 'cell-index';
        idx.textContent = i;
        
        const val = document.createElement('div');
        val.className = 'cell-value';
        val.textContent = interpreter.memory[i];
        
        cell.appendChild(idx);
        cell.appendChild(val);
        elements.tape.appendChild(cell);
    }
    
    elements.pointerVal.textContent = interpreter.pointer;
    elements.cellVal.textContent = interpreter.memory[interpreter.pointer];
}

function updateUI() {
    renderTape();
    elements.programOutput.textContent = interpreter.output;
    
    // Highlight current instruction
    if (interpreter.pc < interpreter.instructions.length) {
        const originalIdx = interpreter.instructionMap[interpreter.pc];
        highlightCode(originalIdx);
    } else {
        highlightCode(-1); // Clear highlight
    }
}

function step() {
    if (interpreter.instructions.length === 0) {
        interpreter.load(elements.codeInput.value, elements.programInput.value);
    }
    
    const canContinue = interpreter.step();
    updateUI();
    
    if (!canContinue) {
        pause();
        elements.btnRun.disabled = false;
    }
    
    return canContinue;
}

function runLoop() {
    if (!interpreter.isRunning) return;
    
    let canContinue = true;
    const steps = interpreter.stepsPerTick;
    
    for (let i = 0; i < steps; i++) {
        canContinue = interpreter.step();
        if (!canContinue) break;
    }
    
    updateUI();
    
    if (canContinue) {
        interpreter.timer = setTimeout(runLoop, interpreter.delay);
    } else {
        pause();
        elements.btnRun.disabled = false;
    }
}

function run() {
    if (interpreter.isRunning) return;
    
    if (interpreter.pc >= interpreter.instructions.length || interpreter.instructions.length === 0) {
        interpreter.load(elements.codeInput.value, elements.programInput.value);
    }
    
    interpreter.isRunning = true;
    elements.btnRun.disabled = true;
    elements.btnStep.disabled = true;
    elements.btnPause.disabled = false;
    elements.codeInput.disabled = true; // Prevent editing while running
    
    runLoop();
}

function pause() {
    interpreter.isRunning = false;
    if (interpreter.timer) {
        clearTimeout(interpreter.timer);
        interpreter.timer = null;
    }
    elements.btnRun.disabled = false;
    elements.btnStep.disabled = false;
    elements.btnPause.disabled = true;
    elements.codeInput.disabled = false;
}

function reset() {
    pause();
    interpreter.reset();
    interpreter.load(elements.codeInput.value, elements.programInput.value); // Reload to clear state but keep code
    interpreter.pc = 0; // Ensure PC is 0
    updateUI();
    highlightCode(-1);
}

// Initialize
init();

