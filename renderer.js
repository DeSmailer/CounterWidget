const { ipcRenderer } = require('electron');

const STORAGE_KEY = 'counter-widget-state-v1';

const greenValue = document.getElementById('greenValue');
const redValue = document.getElementById('redValue');
const percent = document.getElementById('percent');
const greenMinusButton = document.getElementById('greenMinus');
const redMinusButton = document.getElementById('redMinus');
const widget = document.getElementById('widget');
const historyPanel = document.getElementById('historyPanel');
const filterMode = document.getElementById('filterMode');
const singleDate = document.getElementById('singleDate');
const rangeStart = document.getElementById('rangeStart');
const rangeEnd = document.getElementById('rangeEnd');
const summaryGreen = document.getElementById('summaryGreen');
const summaryRed = document.getElementById('summaryRed');
const summaryPercent = document.getElementById('summaryPercent');
const dayList = document.getElementById('dayList');
const entryList = document.getElementById('entryList');
const historyChart = document.getElementById('historyChart');
const chartContext = historyChart.getContext('2d');
const chartToggle = document.getElementById('chartToggle');
const exportDataButton = document.getElementById('exportData');
const importDataButton = document.getElementById('importData');
const historyStatus = document.getElementById('historyStatus');

let state = loadState();
let green = 0;
let red = 0;
let editingEntryId = null;
let historyOpen = false;

function loadState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && Array.isArray(saved.entries)) {
            return {
                entries: normalizeEntries(saved.entries),
                chartOpen: saved.chartOpen !== false
            };
        }
    } catch {
        // Ignore broken local data and start with a clean log.
    }

    return { entries: [], chartOpen: true };
}

function normalizeEntries(entries) {
    return entries
        .filter((entry) => entry && (entry.type === 'reset' || entry.type === 'adjust'))
        .filter((entry) => entry.occurredAt && !Number.isNaN(new Date(entry.occurredAt).getTime()))
        .filter((entry) => entry.type === 'reset' || entry.delta > 0)
        .map((entry) => {
            if (entry.type === 'reset') {
                return {
                    id: entry.id || createId(),
                    type: 'reset',
                    occurredAt: new Date(entry.occurredAt).toISOString()
                };
            }

            return {
                id: entry.id || createId(),
                type: 'adjust',
                counter: entry.counter === 'red' ? 'red' : 'green',
                delta: Math.max(1, Math.floor(Number(entry.delta))),
                occurredAt: new Date(entry.occurredAt).toISOString()
            };
        });
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function exportPayload() {
    return {
        app: 'Counter Widget',
        version: 1,
        exportedAt: new Date().toISOString(),
        state
    };
}

function stateFromImport(data) {
    const importedState = data && Array.isArray(data.entries) ? data : data?.state;

    if (!importedState || !Array.isArray(importedState.entries)) {
        throw new Error('Файл не похож на сохранение счетчика.');
    }

    return {
        entries: normalizeEntries(importedState.entries),
        chartOpen: importedState.chartOpen !== false
    };
}

function showHistoryStatus(message, isError = false) {
    historyStatus.hidden = false;
    historyStatus.textContent = message;
    historyStatus.classList.toggle('error', isError);
}

function createId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function todayKey() {
    return dateKey(new Date());
}

function yesterdayKey() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return dateKey(date);
}

function formatDateTime(iso) {
    return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function toDateTimeInputValue(iso) {
    const date = new Date(iso);
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeInputValue(value) {
    return new Date(value).toISOString();
}

function calculatePercent(greenCount, redCount) {
    const total = greenCount + redCount;
    return total <= 0 ? 0 : Math.round((greenCount / total) * 100);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function counterLabel(counter) {
    return counter === 'green' ? 'Зеленый' : 'Красный';
}

function orderedEntries() {
    return [...state.entries].sort((a, b) => {
        const dateDiff = new Date(a.occurredAt) - new Date(b.occurredAt);
        return dateDiff || a.id.localeCompare(b.id);
    });
}

function rebuildTotals() {
    green = 0;
    red = 0;

    orderedEntries().forEach((entry) => {
        if (entry.type === 'reset') {
            green = 0;
            red = 0;
            return;
        }

        if (entry.counter === 'green') {
            green += entry.delta;
        } else {
            red += entry.delta;
        }
    });
}

function updateCounterView() {
    greenValue.textContent = green;
    redValue.textContent = red;
    percent.textContent = `${calculatePercent(green, red)}%`;
    greenMinusButton.disabled = green <= 0;
    redMinusButton.disabled = red <= 0;
}

function addAdjustment(counter, delta) {
    if (delta <= 0) {
        return;
    }

    state.entries.push({
        id: createId(),
        type: 'adjust',
        counter,
        delta,
        occurredAt: new Date().toISOString()
    });

    refreshAll();
}

function deleteLastAdjustment(counter) {
    const entries = orderedEntries();
    const lastResetIndex = entries.findLastIndex((entry) => entry.type === 'reset');
    const activeEntries = entries.slice(lastResetIndex + 1);
    const entryToDelete = [...activeEntries]
        .reverse()
        .find((entry) => entry.type === 'adjust' && entry.counter === counter);

    if (!entryToDelete) {
        return;
    }

    deleteEntry(entryToDelete.id);
}

function addReset() {
    state.entries.push({
        id: createId(),
        type: 'reset',
        occurredAt: new Date().toISOString()
    });

    refreshAll();
}

function getFilterRange() {
    const mode = filterMode.value;

    if (mode === 'today') {
        return { start: todayKey(), end: todayKey() };
    }

    if (mode === 'yesterday') {
        return { start: yesterdayKey(), end: yesterdayKey() };
    }

    if (mode === 'day') {
        return { start: singleDate.value, end: singleDate.value };
    }

    if (mode === 'range') {
        return { start: rangeStart.value, end: rangeEnd.value };
    }

    return { start: '', end: '' };
}

function filteredEntries() {
    const { start, end } = getFilterRange();

    return orderedEntries()
        .filter((entry) => {
            const key = dateKey(new Date(entry.occurredAt));
            return (!start || key >= start) && (!end || key <= end);
        })
        .reverse();
}

function entryDelta(entry, counter) {
    if (entry.type !== 'adjust' || entry.counter !== counter) {
        return 0;
    }

    return entry.delta;
}

function buildDayStats(entries) {
    const days = new Map();

    entries.forEach((entry) => {
        const key = dateKey(new Date(entry.occurredAt));
        const item = days.get(key) || { date: key, green: 0, red: 0, resets: 0 };

        item.green += entryDelta(entry, 'green');
        item.red += entryDelta(entry, 'red');
        item.resets += entry.type === 'reset' ? 1 : 0;
        days.set(key, item);
    });

    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function renderSummary(entries) {
    const greenSum = entries.reduce((sum, entry) => sum + entryDelta(entry, 'green'), 0);
    const redSum = entries.reduce((sum, entry) => sum + entryDelta(entry, 'red'), 0);

    summaryGreen.textContent = greenSum;
    summaryRed.textContent = redSum;
    summaryPercent.textContent = `${calculatePercent(greenSum, redSum)}%`;
}

function renderDayList(dayStats) {
    dayList.innerHTML = '';

    dayStats.forEach((item) => {
        const row = document.createElement('button');
        row.className = 'day-row';
        row.innerHTML = `
            <span>${item.date}</span>
            <span class="green-text">${item.green}</span>
            <span class="red-text">${item.red}</span>
            <span>${calculatePercent(item.green, item.red)}%</span>
        `;
        row.addEventListener('click', () => {
            filterMode.value = 'day';
            singleDate.value = item.date;
            updateFilterInputs();
            renderHistory();
        });
        dayList.appendChild(row);
    });

    if (!dayStats.length) {
        dayList.innerHTML = '<div class="empty-state">Нет записей для этого фильтра.</div>';
    }
}

function renderChart(dayStats) {
    historyChart.hidden = !state.chartOpen;
    chartToggle.textContent = state.chartOpen ? 'Скрыть' : 'Показать';

    if (!state.chartOpen) {
        return;
    }

    const width = historyChart.width;
    const height = historyChart.height;
    const padding = { top: 16, right: 18, bottom: 34, left: 34 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    chartContext.clearRect(0, 0, width, height);
    chartContext.fillStyle = '#202027';
    chartContext.fillRect(0, 0, width, height);

    chartContext.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    chartContext.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (plotHeight / 4) * i;
        chartContext.beginPath();
        chartContext.moveTo(padding.left, y);
        chartContext.lineTo(width - padding.right, y);
        chartContext.stroke();
    }

    if (!dayStats.length) {
        chartContext.fillStyle = '#aaaab3';
        chartContext.font = '13px Arial';
        chartContext.textAlign = 'center';
        chartContext.fillText('Нет данных для графика', width / 2, height / 2);
        return;
    }

    const visibleStats = dayStats.slice(-14);
    const values = visibleStats.flatMap((item) => [item.green, item.red]);
    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(0, ...values);
    const valueRange = Math.max(1, maxValue - minValue);
    const groupWidth = plotWidth / visibleStats.length;
    const barWidth = Math.min(18, Math.max(5, groupWidth * 0.22));
    const valueToY = (value) => padding.top + ((maxValue - value) / valueRange) * plotHeight;
    const zeroY = valueToY(0);
    const percentPoints = [];

    visibleStats.forEach((item, index) => {
        const centerX = padding.left + groupWidth * index + groupWidth / 2;
        const greenY = valueToY(item.green);
        const redY = valueToY(item.red);
        const greenTop = Math.min(greenY, zeroY);
        const redTop = Math.min(redY, zeroY);
        const greenHeight = Math.abs(greenY - zeroY);
        const redHeight = Math.abs(redY - zeroY);
        const percentValue = calculatePercent(item.green, item.red);
        const percentY = padding.top + plotHeight - (clamp(percentValue, 0, 100) / 100) * plotHeight;

        chartContext.fillStyle = '#2ecc71';
        chartContext.fillRect(centerX - barWidth - 2, greenTop, barWidth, greenHeight);

        chartContext.fillStyle = '#ff4d4d';
        chartContext.fillRect(centerX + 2, redTop, barWidth, redHeight);

        chartContext.fillStyle = '#aaaab3';
        chartContext.font = '10px Arial';
        chartContext.textAlign = 'center';
        chartContext.fillText(item.date.slice(5), centerX, height - 12);

        percentPoints.push({ x: centerX, y: percentY });
    });

    chartContext.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    chartContext.lineWidth = 1;
    chartContext.beginPath();
    chartContext.moveTo(padding.left, zeroY);
    chartContext.lineTo(width - padding.right, zeroY);
    chartContext.stroke();

    if (percentPoints.length) {
        chartContext.strokeStyle = '#f4d35e';
        chartContext.lineWidth = 2;
        chartContext.beginPath();
        percentPoints.forEach((point, index) => {
            if (index === 0) {
                chartContext.moveTo(point.x, point.y);
            } else {
                chartContext.lineTo(point.x, point.y);
            }
        });
        chartContext.stroke();

        chartContext.fillStyle = '#f4d35e';
        percentPoints.forEach((point) => {
            chartContext.beginPath();
            chartContext.arc(point.x, point.y, 3, 0, Math.PI * 2);
            chartContext.fill();
        });
    }

    chartContext.fillStyle = '#aaaab3';
    chartContext.font = '10px Arial';
    chartContext.textAlign = 'left';
    chartContext.fillText(`${maxValue}`, 6, padding.top + 4);
    chartContext.fillText('0', 18, zeroY + 3);
    chartContext.fillText(`${minValue}`, 6, padding.top + plotHeight);

    chartContext.textAlign = 'right';
    chartContext.fillText('100%', width - 4, padding.top + 4);
    chartContext.fillText('0%', width - 4, zeroY);
}

function renderEntryList(entries) {
    entryList.innerHTML = '';

    entries.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'entry-card';
        row.dataset.id = entry.id;

        if (editingEntryId === entry.id) {
            row.innerHTML = renderEntryEditor(entry);
        } else {
            row.innerHTML = renderEntryDisplay(entry);
        }

        entryList.appendChild(row);
    });
}

function renderEntryDisplay(entry) {
    if (entry.type === 'reset') {
        return `
            <div class="entry-main">
                <div class="entry-kind">Сброс</div>
                <div class="entry-date">${formatDateTime(entry.occurredAt)}</div>
            </div>
            <div class="entry-actions">
                <button data-action="edit">Изменить</button>
                <button data-action="delete">Удалить</button>
            </div>
        `;
    }

    const sign = entry.delta > 0 ? '+' : '';
    const colorClass = entry.counter === 'green' ? 'green-text' : 'red-text';

    return `
        <div class="entry-main">
            <div class="entry-kind ${colorClass}">${counterLabel(entry.counter)} ${sign}${entry.delta}</div>
            <div class="entry-date">${formatDateTime(entry.occurredAt)}</div>
        </div>
        <div class="entry-actions">
            <button data-action="edit">Изменить</button>
            <button data-action="delete">Удалить</button>
        </div>
    `;
}

function renderEntryEditor(entry) {
    const isAdjust = entry.type === 'adjust';

    return `
        <div class="edit-grid">
            <input type="datetime-local" data-field="occurredAt" value="${toDateTimeInputValue(entry.occurredAt)}" />
            ${isAdjust ? `
                <select data-field="counter">
                    <option value="green" ${entry.counter === 'green' ? 'selected' : ''}>Зеленый</option>
                    <option value="red" ${entry.counter === 'red' ? 'selected' : ''}>Красный</option>
                </select>
                <input type="number" min="1" step="1" data-field="delta" value="${Math.max(1, entry.delta)}" />
            ` : '<div class="reset-editor">Сброс до нуля</div>'}
        </div>
        <div class="entry-actions">
            <button data-action="save">Сохранить</button>
            <button data-action="cancel">Отмена</button>
        </div>
    `;
}

function renderHistory() {
    const entries = filteredEntries();
    const dayStats = buildDayStats(entries);

    renderSummary(entries);
    renderChart(dayStats);
    renderDayList(dayStats);
    renderEntryList(entries);
}

function updateFilterInputs() {
    const mode = filterMode.value;
    singleDate.hidden = mode !== 'day';
    rangeStart.hidden = mode !== 'range';
    rangeEnd.hidden = mode !== 'range';
}

function openDatePicker(input) {
    if (input.hidden) {
        return;
    }

    input.focus();

    if (typeof input.showPicker === 'function') {
        input.showPicker();
    }
}

function refreshAll() {
    rebuildTotals();
    saveState();
    updateCounterView();
    renderHistory();
}

function setHistoryOpen(isOpen) {
    historyOpen = isOpen;
    historyPanel.hidden = !isOpen;
    widget.classList.toggle('history-open', isOpen);
    ipcRenderer.send('history-visibility', isOpen);

    if (isOpen) {
        renderHistory();
    }
}

function saveEditedEntry(row) {
    const entry = state.entries.find((item) => item.id === row.dataset.id);
    if (!entry) {
        return;
    }

    const dateInput = row.querySelector('[data-field="occurredAt"]');
    if (dateInput.value) {
        entry.occurredAt = fromDateTimeInputValue(dateInput.value);
    }

    if (entry.type === 'adjust') {
        const counterInput = row.querySelector('[data-field="counter"]');
        const deltaInput = row.querySelector('[data-field="delta"]');
        const nextDelta = Math.floor(Number(deltaInput.value));

        entry.counter = counterInput.value;
        entry.delta = Number.isFinite(nextDelta) && nextDelta > 0 ? nextDelta : 1;
    }

    editingEntryId = null;
    refreshAll();
}

function deleteEntry(id) {
    state.entries = state.entries.filter((entry) => entry.id !== id);
    editingEntryId = null;
    refreshAll();
}

document.getElementById('greenPlus').addEventListener('click', () => addAdjustment('green', 1));
greenMinusButton.addEventListener('click', () => deleteLastAdjustment('green'));
document.getElementById('redPlus').addEventListener('click', () => addAdjustment('red', 1));
redMinusButton.addEventListener('click', () => deleteLastAdjustment('red'));
document.getElementById('reset').addEventListener('click', addReset);
document.getElementById('historyOpen').addEventListener('click', () => setHistoryOpen(!historyOpen));
document.getElementById('historyClose').addEventListener('click', () => setHistoryOpen(false));
chartToggle.addEventListener('click', () => {
    state.chartOpen = !state.chartOpen;
    saveState();
    renderHistory();
});
exportDataButton.addEventListener('click', async () => {
    try {
        const result = await ipcRenderer.invoke('export-save-data', exportPayload());

        if (!result.canceled) {
            showHistoryStatus('Данные выгружены в файл.');
        }
    } catch (error) {
        showHistoryStatus(`Не удалось выгрузить данные: ${error.message}`, true);
    }
});
importDataButton.addEventListener('click', async () => {
    try {
        const result = await ipcRenderer.invoke('import-save-data');

        if (result.canceled) {
            return;
        }

        state = stateFromImport(result.data);
        editingEntryId = null;
        refreshAll();
        showHistoryStatus('Данные загружены из файла.');
    } catch (error) {
        showHistoryStatus(`Не удалось загрузить данные: ${error.message}`, true);
    }
});

filterMode.addEventListener('change', () => {
    updateFilterInputs();
    renderHistory();

    if (filterMode.value === 'day') {
        openDatePicker(singleDate);
    }

    if (filterMode.value === 'range') {
        openDatePicker(rangeStart);
    }
});

[singleDate, rangeStart, rangeEnd].forEach((input) => {
    input.addEventListener('click', () => openDatePicker(input));
    input.addEventListener('change', () => {
        renderHistory();

        if (input === rangeStart && filterMode.value === 'range') {
            openDatePicker(rangeEnd);
        }
    });
});

entryList.addEventListener('click', (event) => {
    const actionButton = event.target.closest('button[data-action]');
    if (!actionButton) {
        return;
    }

    const row = actionButton.closest('.entry-card');
    const action = actionButton.dataset.action;

    if (action === 'edit') {
        editingEntryId = row.dataset.id;
        renderHistory();
    }

    if (action === 'cancel') {
        editingEntryId = null;
        renderHistory();
    }

    if (action === 'save') {
        saveEditedEntry(row);
    }

    if (action === 'delete') {
        deleteEntry(row.dataset.id);
    }
});

singleDate.value = todayKey();
rangeStart.value = todayKey();
rangeEnd.value = todayKey();
updateFilterInputs();
refreshAll();
