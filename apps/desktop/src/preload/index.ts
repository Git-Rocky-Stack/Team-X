import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('teamx', {
  version: '0.0.1',
});
