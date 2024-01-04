// /src/index.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import axios from 'axios';
import path from 'node:path';
import isDev from 'electron-is-dev';
import { execFile, ChildProcess } from 'child_process';
import fs from 'fs';

// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let serverProcess: ChildProcess | string | null = null;

// Function to check if the server is ready
const isServerReady = async (
  url: string,
  retries: number = 30,
  delay: number = 1000,
): Promise<boolean> => {
  // console.log(`Checking if server is ready at ${url}`);

  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(url);
      // console.log('Server is ready!');
      return true; // Server responded successfully
    } catch (error) {
      // Type guard to check if error is an instance of Error
      if (error instanceof Error) {
        // console.log(
        //   `Attempt ${i + 1}: Server not ready, retrying in ${delay}ms...`,
        //   error.message,
        // );
      } else {
        // Handle cases where error is not an Error instance
        // console.log(
        //   `Attempt ${i + 1}: Server not ready, retrying in ${delay}ms...`,
        // );
      }
      await new Promise((resolve) => setTimeout(resolve, delay)); // Wait before the next retry
    }
  }
  console.log('Server not ready after retries.');
  return false; // Server not ready after retries
};

const startServer = (): void => {
  if (serverProcess !== null) {
    console.log('Server already started or starting');
    return;
  }

  const apiPath = isDev
    ? path.join(__dirname, '../../src/api', 'main')
    : path.join(process.resourcesPath, 'main');

  // Log the apiPath
  // console.log(`API Path: ${apiPath}`);

  // Check if the API exe file exists
  if (!fs.existsSync(apiPath)) {
    console.error(`FastAPI executable not found at ${apiPath}`);
    return;
  }

  // console.log('Starting FastAPI server...');

  serverProcess = 'starting';

  serverProcess = execFile(
    apiPath,
    (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        console.error('Error starting FastAPI server:', error);
        serverProcess = null;
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    },
  );

  // console.log('FastAPI server should be running...');
};

// -----------------------------------------------------------------------------

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = (): void => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
};

// -----------------------------------------------------------------------------

// Used for managing the user's workspace directory
ipcMain.handle('get-file-storage-path', async () => {
  return app.getPath('userData');
});

// Used for fetching data from the FastAPI server
ipcMain.handle('fetch-data', async () => {
  // console.log('IPC fetch-data called');
  const serverReady = await isServerReady('http://0.0.0.0:8000/status'); // https://localhost:8000/status doesn't work
  if (!serverReady) {
    console.error('FastAPI server is not ready');
    return { error: 'FastAPI server is not ready' };
  }

  // console.log('Fetching data from FastAPI server');
  try {
    const response = await axios.get('http://0.0.0.0:8000/status'); // https://localhost:8000/status doesn't work
    // console.log('Data fetched:', response.data);
    return response.data;
  } catch (error) {
    // console.error('Error fetching data:', error);
    return { error: 'Failed to fetch data' };
  }
});

const terminateServer = (): void => {
  if (serverProcess && typeof serverProcess !== 'string') {
    console.log('Terminating FastAPI server...');
    serverProcess.kill();
    serverProcess = null;
  }
};

// -----------------------------------------------------------------------------

// Handler to list files in a specific directory
ipcMain.handle('list-files', async (event, directoryPath) => {
  try {
    const files = fs
      .readdirSync(directoryPath)
      .filter((file) => file !== 'copy_marker.txt');
    return files.map((file) => {
      const filePath = path.join(directoryPath, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
      };
    });
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
});

// Handler to upload a file to a specific directory
ipcMain.handle('upload-file', async (event, { filePath, destination }) => {
  try {
    const fileName = path.basename(filePath);
    const destinationPath = path.join(destination, fileName);
    fs.copyFileSync(filePath, destinationPath);
    return { success: true, path: destinationPath };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
});

// Handler to open file dialog and return selected file path
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'] });
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('get-desktop-path', async () => {
  const desktopPath = app.getPath('desktop');
  console.log('Desktop Path:', desktopPath);
  return desktopPath;
});

ipcMain.handle('get-data-path', async () => {
  const userDataPath = app.getPath('userData');
  const dataPath = path.join(userDataPath, 'workspace');

  // Check if the 'data' directory exists, if not, create it
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }

  return dataPath;
});

ipcMain.handle(
  'check-file-exists',
  async (event, { fileName, destination }) => {
    const filePath = path.join(destination, fileName);
    const exists = fs.existsSync(filePath);
    return { exists };
  },
);

ipcMain.handle('read-file', async (event, fileName) => {
  const userDataPath = app.getPath('userData');
  const workspacePath = path.join(userDataPath, 'workspace', fileName);

  try {
    const data = fs.readFileSync(workspacePath, 'utf8');
    return data;
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
});

// -----------------------------------------------------------------------------

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

app.on('before-quit', terminateServer);

app.on('ready', () => {
  // Copy the test dataset to the `workspace` directory if it doesn't exist
  const userDataPath = app.getPath('userData');
  const workspacePath = path.join(userDataPath, 'workspace');
  const csvFilePath = path.join(workspacePath, 'test_data.csv');
  const copyMarker = path.join(workspacePath, 'copy_marker.txt');

  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  // Check if the marker file exists
  if (!fs.existsSync(copyMarker)) {
    const sourceCsvPath = path.join(process.resourcesPath, 'test_data.csv');
    if (fs.existsSync(sourceCsvPath)) {
      fs.copyFileSync(sourceCsvPath, csvFilePath);
      // Create a marker file to indicate the file has been copied once
      fs.writeFileSync(
        copyMarker,
        'test_data.csv has been copied to this directory.',
      );
    } else {
      console.error('CSV file not found at:', sourceCsvPath);
    }
  }

  startServer();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
