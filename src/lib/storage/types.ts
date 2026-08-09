export type FileStorage = {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
};
