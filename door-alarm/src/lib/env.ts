function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },
  get appUrl() { return required("APP_URL").replace(/\/$/, ""); },
  get googleClientId() { return required("GOOGLE_CLIENT_ID"); },
  get googleClientSecret() { return required("GOOGLE_CLIENT_SECRET"); },
  get allowedEmail() { return process.env.ALLOWED_EMAIL?.trim().toLowerCase() || null; },
  get encryptionKey() { return required("ENCRYPTION_KEY"); },
  get sessionSecret() { return required("SESSION_SECRET"); },
  get cronSecret() { return required("CRON_SECRET"); },
};
