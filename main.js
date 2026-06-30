const { app, BrowserWindow, ipcMain } = require('electron');

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
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});
