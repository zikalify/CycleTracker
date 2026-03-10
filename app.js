// --- PWA Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('Service Worker Registered');
        }).catch(err => console.log('SW Registration failed', err));
    });
}

// --- State Management ---
let currentDate = new Date();
const STORAGE_KEY = 'symphony_nfp_data';
let cycleData = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

// --- DOM Elements ---
const currentDateDisplay = document.getElementById('currentDateDisplay');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const dailyForm = document.getElementById('dailyForm');
const bleedingGroup = document.getElementById('bleedingGroup');
const mucusGroup = document.getElementById('mucusGroup');
const bbtInput = document.getElementById('bbtInput');
const insightMessage = document.getElementById('insightMessage');
const fertilityStatus = document.getElementById('fertilityStatus');
const fertilityIndicator = document.getElementById('fertilityIndicator');
const cycleDayDisplay = document.getElementById('cycleDayDisplay');
const cyclePhaseDisplay = document.getElementById('cyclePhaseDisplay');
const toast = document.getElementById('toast');

// --- Initialization ---
function init() {
    updateDateDisplay();
    loadDailyData();
    analyzeCycle();
    setupEventListeners();
}

function formatDateKey(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
}

function getTodayKey() {
    return formatDateKey(new Date());
}

function updateDateDisplay() {
    const key = formatDateKey(currentDate);
    const todayKey = getTodayKey();
    
    if (key === todayKey) {
        currentDateDisplay.textContent = 'Today';
        nextBtn.disabled = true;
    } else {
        const options = { weekday: 'short', month: 'short', day: 'numeric' };
        currentDateDisplay.textContent = currentDate.toLocaleDateString(undefined, options);
        nextBtn.disabled = false;
    }
}

function setupEventListeners() {
    prevBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 1);
        handleDateChange();
    });

    nextBtn.addEventListener('click', () => {
        if (formatDateKey(currentDate) !== getTodayKey()) {
            currentDate.setDate(currentDate.getDate() + 1);
            handleDateChange();
        }
    });

    // Custom Button Groups logic
    setupButtonGroup(bleedingGroup);
    setupButtonGroup(mucusGroup);

    // Form Submission
    dailyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveDailyData();
    });
}

function setupButtonGroup(groupElement) {
    const buttons = groupElement.querySelectorAll('.option-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function handleDateChange() {
    updateDateDisplay();
    loadDailyData();
    analyzeCycle();
}

function loadDailyData() {
    const key = formatDateKey(currentDate);
    const data = cycleData[key] || { bleeding: 'none', mucus: 'none', bbt: '' };

    // Set Bleeding
    setButtonGroupValue(bleedingGroup, data.bleeding);
    
    // Set Mucus
    setButtonGroupValue(mucusGroup, data.mucus);

    // Set BBT
    bbtInput.value = data.bbt || '';
}

function setButtonGroupValue(groupElement, value) {
    const buttons = groupElement.querySelectorAll('.option-btn');
    let found = false;
    buttons.forEach(btn => {
        if (btn.dataset.value === value) {
            btn.classList.add('active');
            found = true;
        } else {
            btn.classList.remove('active');
        }
    });
    // Default to first if none found
    if (!found && buttons.length > 0) buttons[0].classList.add('active');
}

function getButtonGroupValue(groupElement) {
    const activeBtn = groupElement.querySelector('.option-btn.active');
    return activeBtn ? activeBtn.dataset.value : 'none';
}

function saveDailyData() {
    const key = formatDateKey(currentDate);
    
    cycleData[key] = {
        bleeding: getButtonGroupValue(bleedingGroup),
        mucus: getButtonGroupValue(mucusGroup),
        bbt: parseFloat(bbtInput.value) || null
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cycleData));
    
    showToast('Entry Saved!');
    analyzeCycle(); // Re-analyze after saving
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// --- Symptothermal Algorithm ---
function analyzeCycle() {
    const sortedDates = Object.keys(cycleData).sort();
    if (sortedDates.length === 0) {
        setInsight("Unknown", "Start logging data to get insights.", "var(--unknown)", "-", "-");
        return;
    }

    // 1. Find the start of the current cycle (most recent period start)
    let cycleStartKey = null;
    let isPeriodContext = false;
    
    // Iterate backwards to find the start of the most recent period bleeding block
    // Full bleeding (light, medium, heavy) starts a cycle. Spotting does not usually start a cycle unless it flows into full.
    for (let i = sortedDates.length - 1; i >= 0; i--) {
        const dateKey = sortedDates[i];
        const data = cycleData[dateKey];
        const isBleedingDay = ['light', 'medium', 'heavy'].includes(data.bleeding);
        
        if (isBleedingDay) {
            isPeriodContext = true;
            cycleStartKey = dateKey; // Keep shifting backwards while bleeding is contiguous to find day 1
        } else if (isPeriodContext) {
            // We stepped back into a non-bleeding day, so the cycle start was the last date we checked
            // Actually, we need contiguous bleeding. If we hit none, we break.
            break; 
        }
    }

    if (!cycleStartKey) {
        // No period logged ever, default to earliest date as cycle day 1 for now
        cycleStartKey = sortedDates[0];
    }

    const currentKey = formatDateKey(currentDate);
    
    // Only analyze if the selected date is ON or AFTER the cycle start
    if (currentKey < cycleStartKey) {
        setInsight("Past Cycle", "Viewing history prior to current cycle.", "var(--unknown)", "-", "-");
        return;
    }

    // Calculate Cycle Day
    const startMs = new Date(cycleStartKey).getTime();
    const currentMs = new Date(currentKey).getTime();
    const cycleDay = Math.floor((currentMs - startMs) / (1000 * 60 * 60 * 24)) + 1;

    // Get Data up to current viewer date
    const datesUpToCurrent = sortedDates.filter(d => d >= cycleStartKey && d <= currentKey);
    const todayData = cycleData[currentKey] || { bleeding: 'none', mucus: 'none' };
    
    let isHighlyFertile = false;
    let isPotentiallyFertile = false;
    let ovulationConfirmed = checkBBTShift(datesUpToCurrent);
    
    // Check Mucus for fertility
    if (['watery', 'eggwhite'].includes(todayData.mucus)) {
        isHighlyFertile = true;
    } else if (['sticky', 'creamy'].includes(todayData.mucus)) {
        isPotentiallyFertile = true;
    }

    // Determine Phase and Status
    let phase = "-";
    let statusText = "";
    let color = "var(--unknown)";
    let message = "";

    const isBleeding = ['light', 'medium', 'heavy', 'spotting'].includes(todayData.bleeding);

    if (isBleeding && cycleDay <= 7) {
        phase = "Menstruation";
        statusText = "Period";
        color = "var(--period)";
        message = `Cycle Day ${cycleDay}: Menstruation phase. Fertility is typically low, but assume potential fertility if your cycles are short.`;
    } else if (ovulationConfirmed) {
        phase = "Luteal Phase";
        statusText = "Low Fertility";
        color = "var(--fertile-low)";
        message = `Post-Ovulation: Temperature shift detected. Fertility is highly unlikely.`;
    } else if (isHighlyFertile) {
        phase = "Follicular Phase";
        statusText = "High Fertility";
        color = "var(--fertile-high)";
        message = `Approaching Ovulation: Peak-type mucus detected. This is your most fertile window.`;
    } else if (isPotentiallyFertile) {
        phase = "Follicular Phase";
        statusText = "Potentially Fertile";
        color = "var(--fertile-high)";
        message = `Fertile Window Opening: Non-peak mucus detected. Sperm can survive in this environment.`;
    } else {
        phase = "Follicular Phase";
        statusText = "Pre-Ovulatory";
        color = "var(--unknown)";
        message = `Cycle Day ${cycleDay}: Keep tracking daily routines to detect your fertile window opening.`;
    }

    setInsight(statusText, message, color, cycleDay, phase);
}

// 3-over-6 rule: 3 days of temps >= 0.2C above the highest of the previous 6 days
function checkBBTShift(dates) {
    if (dates.length < 9) return false; // Need at least 9 days for the rule

    // Look at the last 3 days
    const last3Dates = dates.slice(-3);
    const last3Temps = last3Dates.map(d => cycleData[d].bbt).filter(t => t !== null && !isNaN(t));
    
    if (last3Temps.length < 3) return false;

    // Look at the 6 days before those 3
    const prev6Dates = dates.slice(-9, -3);
    const prev6Temps = prev6Dates.map(d => cycleData[d].bbt).filter(t => t !== null && !isNaN(t));

    if (prev6Temps.length < 6) return false; // Missing data for strict rule

    const highestPrev6 = Math.max(...prev6Temps);
    const threshold = highestPrev6 + 0.2;

    // Are all of the last 3 temps strictly >= the threshold?
    const isShiftConfirmed = last3Temps.every(t => t >= threshold);
    
    return isShiftConfirmed;
}

function setInsight(statusLabel, message, colorCode, dayLabel, phaseLabel) {
    fertilityStatus.textContent = statusLabel;
    insightMessage.textContent = message;
    fertilityIndicator.style.backgroundColor = colorCode;
    
    // The visual border of the card
    document.getElementById('insightCard').style.borderTopColor = colorCode;
    
    cycleDayDisplay.textContent = dayLabel;
    cyclePhaseDisplay.textContent = phaseLabel;
}

// Boot up
init();
