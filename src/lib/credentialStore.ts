export interface StoredCredential {
  username: string;
  name: string;
  passwordPlain: string;
}

declare const globalThis: {
  credentialStoreGlobal?: Map<string, StoredCredential>;
} & typeof global;

export const credentialStore =
  globalThis.credentialStoreGlobal ??
  new Map<string, StoredCredential>();

if (process.env.NODE_ENV !== "production") {
  globalThis.credentialStoreGlobal = credentialStore;
}
