import { createGoogleDriveApiReader } from "./google-drive-api-reader.mjs";
import { createLocalDriveReader } from "./local-drive-reader.mjs";

export const createDataReader = (loadedConfig) => {
  const readerName = loadedConfig.config.data_reader || "google_drive_api";

  if (readerName === "google_drive_api" || readerName === "google_drive") {
    return createGoogleDriveApiReader(loadedConfig);
  }

  if (readerName === "local_drive") {
    return createLocalDriveReader(loadedConfig);
  }

  throw new Error(`Unsupported data_reader "${readerName}". Use "google_drive_api" for online Google Drive.`);
};
