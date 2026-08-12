let port: any | null = null;
let writer: any | null = null;
let connectionStatus = false;
let logCallback: ((log: string) => void) | null = null;

const log = (msg: string) => {
  if (logCallback) {
    logCallback(msg);
  }
};

export const onSerialLog = (callback: (log: string) => void) => {
  logCallback = callback;
};

export const isSerialConnected = (): boolean => {
  return connectionStatus && port !== null;
};

export const connectSerial = async (): Promise<boolean> => {
  if (!('serial' in navigator)) {
    log('ERROR: Web Serial API not supported in this browser. Use Chrome/Edge.');
    return false;
  }

  try {
    log('Prompting user to select a Serial Port...');
    port = await (navigator as any).serial.requestPort();
    log('Opening port at 9600 baud...');
    await port.open({ baudRate: 9600 });
    
    writer = port.writable.getWriter();
    connectionStatus = true;
    log('SUCCESS: Serial connection established.');
    
    // Listen to close/disconnect events
    port.addEventListener('disconnect', () => {
      log('WARNING: Serial device disconnected.');
      disconnectSerial();
    });

    return true;
  } catch (err: any) {
    log(`ERROR: Failed to connect serial: ${err.message || err}`);
    port = null;
    writer = null;
    connectionStatus = false;
    return false;
  }
};

export const disconnectSerial = async () => {
  try {
    if (writer) {
      log('Releasing port writer...');
      writer.releaseLock();
      writer = null;
    }
    if (port) {
      log('Closing Serial Port...');
      await port.close();
      port = null;
    }
    connectionStatus = false;
    log('SUCCESS: Serial connection closed.');
  } catch (err: any) {
    log(`ERROR during disconnect: ${err.message || err}`);
  }
};

export const sendSerialCommand = async (char: string) => {
  if (!writer || !connectionStatus) {
    return;
  }

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(char);
    log(`TX -> '${char}'`);
    await writer.write(data);
  } catch (err: any) {
    log(`ERROR: Failed to write to serial: ${err.message || err}`);
  }
};
