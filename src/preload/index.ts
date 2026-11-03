import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi } from '../shared/ipc'

const listen = <T>(channel: string) => (listener: (value: T) => void) => {
  const handler = (_event: unknown, value: T) => listener(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: AppApi = {
  getState: () => ipcRenderer.invoke('state:get'),
  loadLink: (link) => ipcRenderer.invoke('crate:link', link),
  openFile: () => ipcRenderer.invoke('crate:file'),
  loadChoice: (index) => ipcRenderer.invoke('crate:choice', index),
  start: (options) => ipcRenderer.invoke('run:start', options),
  cancel: () => ipcRenderer.invoke('run:cancel'),
  choose: (id, videoId) => ipcRenderer.invoke('track:choose', id, videoId),
  retry: (id) => ipcRenderer.invoke('track:retry', id),
  downloadAgain: (id) => ipcRenderer.invoke('track:again', id),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  openOutput: () => ipcRenderer.invoke('folder:open'),
  openVideo: (videoId) => ipcRenderer.invoke('video:open', videoId),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  updateDownloader: () => ipcRenderer.invoke('tools:update'),
  spotifyStatus: () => ipcRenderer.invoke('spotify:status'),
  spotifyConnect: (clientId) => ipcRenderer.invoke('spotify:connect', clientId),
  spotifyDisconnect: () => ipcRenderer.invoke('spotify:disconnect'),
  myPlaylists: () => ipcRenderer.invoke('spotify:playlists'),
  openSpotifyDashboard: () => ipcRenderer.invoke('spotify:dashboard'),
  copyRedirectUri: () => ipcRenderer.invoke('spotify:copyRedirect'),
  onSession: listen('engine:session'),
  onPatches: listen('engine:patches'),
  onDownloading: listen('engine:downloading'),
  onDone: listen('engine:done')
}

contextBridge.exposeInMainWorld('api', api)
