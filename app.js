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
const exportBtn = document.getElementById('exportBtn');
const importInput = document.getElementById('importInput');

// --- Initialization ---
function init() {
    updateDateDisplay();
    loadDailyData();
    analyzeCycle();
    setupEventListeners();
}

function formatDateKey(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

    if (exportBtn) {
        exportBtn.addEventListener('click', exportData);
    }
    if (importInput) {
        importInput.addEventListener('change', importData);
    }
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
    
    const bleedingVal = getButtonGroupValue(bleedingGroup);
    const mucusVal = getButtonGroupValue(mucusGroup);
    let bbtVal = parseFloat(bbtInput.value);
    
    if (isNaN(bbtVal)) {
        bbtVal = null;
    } else if (bbtVal < 35.0 || bbtVal > 40.0) {
        showToast('Invalid BBT. Must be between 35 and 40°C.');
        return; // Reject invalid BBT
    }

    // Validate enums to prevent garbage data
    const validBleeding = ['none', 'spotting', 'light', 'medium', 'heavy'];
    const validMucus = ['none', 'sticky', 'creamy', 'watery', 'eggwhite'];
    
    cycleData[key] = {
        bleeding: validBleeding.includes(bleedingVal) ? bleedingVal : 'none',
        mucus: validMucus.includes(mucusVal) ? mucusVal : 'none',
        bbt: bbtVal
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

    const currentKey = formatDateKey(currentDate);
    const validDates = sortedDates.filter(d => d <= currentKey);

    if (validDates.length === 0) {
        setInsight("No Past Data", "No history available prior to this date.", "var(--unknown)", "-", "-");
        return;
    }

    // 1. Find the start of the current cycle (most recent period start relative to the viewed date)
    let cycleStartKey = null;
    let isPeriodContext = false;
    
    // Iterate backwards through valid dates. Full bleeding (light, medium, heavy) starts a cycle.
    for (let i = validDates.length - 1; i >= 0; i--) {
        const dateKey = validDates[i];
        const data = cycleData[dateKey];
        const isFullBleeding = ['light', 'medium', 'heavy'].includes(data.bleeding);
        const isSpotting = data.bleeding === 'spotting';
        
        if (isFullBleeding) {
            isPeriodContext = true;
            cycleStartKey = dateKey; // Keep shifting backwards while bleeding is contiguous to find day 1
        } else if (isSpotting && isPeriodContext) {
            break; // Spotting typically doesn't count as contiguous full flow Day 1
        } else if (isPeriodContext) {
            break; 
        }
    }

    if (!cycleStartKey && validDates.length > 0) {
        cycleStartKey = validDates[0];
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
        message = `Post-Ovulation: Temperature shift detected. Probability of fertility is very low.`;
    } else if (isHighlyFertile) {
        phase = "Follicular Phase";
        statusText = "High Fertility (Peak)";
        color = "var(--fertile-high)";
        message = `Approaching Ovulation: Peak-type mucus detected. High probability of fertility.`;
    } else if (isPotentiallyFertile) {
        phase = "Follicular Phase";
        statusText = "Potentially Fertile";
        color = "var(--fertile-high)";
        message = `Fertile Window Opening: Non-peak mucus detected. Moderate probability of fertility.`;
    } else {
        phase = "Follicular Phase";
        statusText = "Pre-Ovulatory";
        color = "var(--unknown)";
        message = `Cycle Day ${cycleDay}: Keep tracking daily routines to detect your fertile window opening.`;
    }

    setInsight(statusText, message, color, cycleDay, phase);
}

// 3-over-6 rule: 3 days of temps >= 0.2C above the highest of the previous 6 days, tolerant of missing days
function checkBBTShift(dates) {
    const recentDates = dates.slice(-14);
    const validTemps = recentDates.map(d => ({ date: d, temp: cycleData[d].bbt })).filter(item => item.temp !== null && !isNaN(item.temp));
    
    if (validTemps.length < 9) return false;

    // Look at the last 3 valid temps
    const last3 = validTemps.slice(-3);
    const prev6 = validTemps.slice(-9, -3);

    const highestPrev6 = Math.max(...prev6.map(item => item.temp));
    const threshold = highestPrev6 + 0.2;

    const isShiftConfirmed = last3.every(item => item.temp >= threshold);
    
    // Realism check: ensure shift is reasonable (e.g., max difference not > 2.0C to avoid garbage data)
    const lowestPrev6 = Math.min(...prev6.map(item => item.temp));
    const highestLast3 = Math.max(...last3.map(item => item.temp));
    if (highestLast3 - lowestPrev6 > 2.0) return false; // Likely invalid data (e.g. fever or typo)

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

// --- Data Export/Import ---
function exportData() {
    const dataStr = JSON.stringify(cycleData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `symphony_backup_${getTodayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (typeof importedData === 'object' && importedData !== null) {
                cycleData = importedData;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(cycleData));
                showToast('Data Imported Successfully!');
                handleDateChange();
            } else {
                showToast('Invalid backup file format.');
            }
        } catch (err) {
            showToast('Error reading backup file.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// Boot up
init();
