const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kakeibo', {
  saveFile: (options) => ipcRenderer.invoke('kakeibo:saveFile', options),
  readSafetyBackup: () => ipcRenderer.invoke('kakeibo:readSafetyBackup'),
  writeSafetyBackup: (data) => ipcRenderer.invoke('kakeibo:writeSafetyBackup', data),
  clearSafetyBackup: () => ipcRenderer.invoke('kakeibo:clearSafetyBackup'),
  lanStart: (options) => ipcRenderer.invoke('kakeibo:lanStart', options),
  lanStop: () => ipcRenderer.invoke('kakeibo:lanStop'),
  onLanReceived: (handler) => {
    const listener = (_event, file) => handler(file)
    ipcRenderer.on('kakeibo:lanReceived', listener)
    return () => ipcRenderer.removeListener('kakeibo:lanReceived', listener)
  },
  remindersSchedule: (options) => ipcRenderer.invoke('kakeibo:remindersSchedule', options),
  remindersCancel: () => ipcRenderer.invoke('kakeibo:remindersCancel'),
  onReminderRoute: (handler) => {
    const listener = (_event, route) => handler(route)
    ipcRenderer.on('kakeibo:reminderRoute', listener)
    return () => ipcRenderer.removeListener('kakeibo:reminderRoute', listener)
  },
})
