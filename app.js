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
const STORAGE_KEY = 'cycletracker_nfp_data';
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
    let data = cycleData[key] || { bleeding: 'unknown', mucus: 'unknown', bbt: '' };

    // Migrate old mucus values if necessary
    data.mucus = migrateMucusValue(data.mucus);

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
    return activeBtn ? activeBtn.dataset.value : 'unknown';
}

function migrateMucusValue(value) {
    const mapping = {
        'none': 'dry',
        'sticky': 'damp',
        'creamy': 'damp',
        'watery': 'slippery',
        'eggwhite': 'slippery'
    };
    return mapping[value] || value;
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
    const validBleeding = ['unknown', 'none', 'spotting', 'light', 'medium', 'heavy'];
    const validMucus = ['unknown', 'dry', 'damp', 'slippery'];

    const bleeding = validBleeding.includes(bleedingVal) ? bleedingVal : 'unknown';
    const mucus = validMucus.includes(mucusVal) ? mucusVal : 'unknown';

    // Only delete the entry if it's completely "Unknown" and no BBT.
    // "None" (bleeding) and "Dry" (mucus) are valid observations that should be saved.
    const isBleedingUnknown = bleeding === 'unknown';
    const isMucusUnknown = mucus === 'unknown';

    if (isBleedingUnknown && isMucusUnknown && bbtVal === null) {
        if (cycleData[key]) {
            delete cycleData[key];
            showToast('Entry Cleared');
        }
    } else {
        cycleData[key] = { bleeding, mucus, bbt: bbtVal };
        showToast('Entry Saved!');
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cycleData));

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

    const currentMs = new Date(currentKey).getTime();
    let cycleDay = "-";
    let datesUpToCurrent = [];

    if (cycleStartKey) {
        const startMs = new Date(cycleStartKey).getTime();
        cycleDay = Math.floor((currentMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
        datesUpToCurrent = sortedDates.filter(d => d >= cycleStartKey && d <= currentKey);
    } else {
        datesUpToCurrent = sortedDates.filter(d => d <= currentKey);
    }

    // Helper: days since a given date key relative to the current view date
    function daysSince(dateKey) {
        const ms = new Date(dateKey).getTime();
        return Math.floor((currentMs - ms) / (1000 * 60 * 60 * 24));
    }
    // Default todayData: Bleeding 'none' is a safe assumption for display for blank days, BUT
    // we use 'unknown' here to detect if the user has actually interacted with the day.
    const todayData = cycleData[currentKey] || { bleeding: 'unknown', mucus: 'unknown' };

    let isHighlyFertile = false;
    let isPotentiallyFertile = false;
    let ovulationConfirmed = checkBBTShift(datesUpToCurrent);
    const recentTemps = datesUpToCurrent.map(d => cycleData[d].bbt).filter(t => t !== null && !isNaN(t));
    const hasTempData = recentTemps.length > 0;

    // Lookback logic: Check for fertile mucus in the last 3 days
    let lastSlipperyKey = null;
    let lastDampKey = null;

    datesUpToCurrent.forEach(dateKey => {
        const data = cycleData[dateKey] || { mucus: 'unknown' };
        if (data.mucus === 'slippery') lastSlipperyKey = dateKey;
        if (data.mucus === 'damp') lastDampKey = dateKey;
    });

    if (lastSlipperyKey) {
        const lastMs = new Date(lastSlipperyKey).getTime();
        const diffDays = Math.floor((currentMs - lastMs) / (1000 * 60 * 60 * 24));
        if (diffDays <= 3) isHighlyFertile = true;
    }

    if (!isHighlyFertile && lastDampKey) {
        const lastMs = new Date(lastDampKey).getTime();
        const diffDays = Math.floor((currentMs - lastMs) / (1000 * 60 * 60 * 24));
        if (diffDays <= 3) isPotentiallyFertile = true;
    }

    // Determine Phase and Status
    let phase = "-";
    let statusText = "";
    let color = "var(--unknown)";
    let message = "";

    const isBleeding = ['light', 'medium', 'heavy', 'spotting'].includes(todayData.bleeding);

    if (isHighlyFertile) {
        phase = cycleStartKey ? "Follicular Phase" : "Unknown Phase";
        statusText = "High Fertility (Peak)";
        color = "var(--fertile-high)";
        message = `High probability of fertility: Peak-type mucus detected (or within 3-day count).`;
    } else if (isPotentiallyFertile) {
        phase = cycleStartKey ? "Follicular Phase" : "Unknown Phase";
        statusText = "Potentially Fertile";
        color = "var(--fertile-high)";
        message = `Moderate probability of fertility: Non-peak mucus detected (or within 3-day count).`;
    } else if (ovulationConfirmed) {
        phase = "Luteal Phase";
        statusText = "Low Fertility (Post-Ovulation)";
        color = "var(--fertile-low)";
        message = `Probability of fertility is very low: Temperature shift and mucus dry-up confirmed.`;
    } else if (isBleeding && cycleDay <= 5) {
        phase = "Menstruation";
        statusText = "Typically Low Fertility (Period)";
        color = "var(--period)";
        message = `Fertility is typically low during early menstruation, but assume potential fertility if your cycles are short (Day 1-5).`;
    } else if (isBleeding && cycleDay > 5) {
        phase = "Follicular Phase";
        statusText = "Potentially Fertile (Bleeding)";
        color = "var(--unknown)";
        message = `You are potentially fertile: Late bleeding/spotting occurs closer to ovulation.`;
    } else {
        if (!cycleStartKey) {
            phase = "Unknown Phase";
            statusText = "Potentially Fertile (Unknown)";
            color = "var(--unknown)";
            message = "Insufficient data to determine cycle phase. Please assume you are potentially fertile to be safe.";
            if (todayData.bleeding === 'none' && todayData.mucus === 'unknown') {
                message += " Missing mucus data - accuracy may be reduced.";
            }
            if (todayData.mucus === 'dry') {
                message += " Low fertility is only assumed during the evening hours, provided no mucus was detected during any point of the day.";
            }
        } else {
            phase = "Follicular Phase";
            statusText = "Potentially Fertile (Pre-Ovulatory)";
            color = "var(--unknown)";
            message = `Assume potential fertility. Keep logging daily to detect your fertile window and confirm ovulation.`;
            
            if (todayData.bleeding === 'none' && todayData.mucus === 'unknown') {
                message += " Missing mucus data - accuracy may be reduced.";
            }
            if (todayData.mucus === 'dry') {
                message += " Low fertility is only assumed during the evening hours, provided no mucus was detected during any point of the day.";
            }
        }
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
    a.download = `cycletracker_backup_${getTodayKey()}.json`;
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
                // Migrate all data on import
                for (let key in importedData) {
                    if (importedData[key].mucus) {
                        importedData[key].mucus = migrateMucusValue(importedData[key].mucus);
                    }
                }
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
