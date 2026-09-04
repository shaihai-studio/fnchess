const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '函数棋',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 直接加载根目录的 index.html
  win.loadFile('index.html');
  win.setMenuBarVisibility(false); // 隐藏默认菜单栏
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
// macOS：点击 Dock 图标时重新创建窗口（若无活动窗口）
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});