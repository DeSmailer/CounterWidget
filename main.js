const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');

const COMPACT_SIZE = { width: 260, height: 196 };
const HISTORY_SIZE = { width: 560, height: 720 };

function createWindow() {
    const win = new BrowserWindow({
        width: COMPACT_SIZE.width,
        height: COMPACT_SIZE.height,
        resizable: false,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');

    ipcMain.on('history-visibility', (_event, isOpen) => {
        const size = isOpen ? HISTORY_SIZE : COMPACT_SIZE;
        win.setSize(size.width, size.height);
    });

    ipcMain.handle('export-save-data', async (_event, data) => {
        const result = await dialog.showSaveDialog(win, {
            title: 'Выгрузить данные счетчика',
            defaultPath: 'counter-widget-data.json',
            filters: [
                { name: 'JSON', extensions: ['json'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { canceled: true };
        }

        await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8');
        return { canceled: false, filePath: result.filePath };
    });

    ipcMain.handle('import-save-data', async () => {
        const result = await dialog.showOpenDialog(win, {
            title: 'Загрузить данные счетчика',
            properties: ['openFile'],
            filters: [
                { name: 'JSON', extensions: ['json'] }
            ]
        });

        if (result.canceled || !result.filePaths.length) {
            return { canceled: true };
        }

        const filePath = result.filePaths[0];
        const content = await fs.readFile(filePath, 'utf8');
        return { canceled: false, filePath, data: JSON.parse(content) };
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});
