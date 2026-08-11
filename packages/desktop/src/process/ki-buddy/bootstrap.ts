import { randomBytes } from 'node:crypto';

export type KiBuddyCoreAuthOptions = {
  bootstrapSecret: string;
  coreCsrfToken: string;
  identityMode: 'aionpro';
};

/** Creates ephemeral credentials for Ki-Buddy's private Core bootstrap boundary. */
export function createKiBuddyCoreAuthOptions(): KiBuddyCoreAuthOptions {
  return {
    bootstrapSecret: randomBytes(32).toString('base64url'),
    coreCsrfToken: randomBytes(32).toString('hex'),
    identityMode: 'aionpro',
  };
}
