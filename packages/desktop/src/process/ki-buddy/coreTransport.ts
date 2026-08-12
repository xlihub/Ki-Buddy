import { setHttpRequestTransport } from '@/common/adapter/httpBridge';
import { isKiBuddyCoreSafeMethod } from '@/common/platform/ki-buddy';

/** Owns Ki-Buddy's private Core authentication protocol in the main process. */
export class KiBuddyMainCoreTransport {
  private accessToken: string | null = null;

  constructor(readonly csrfToken: string) {}

  install(): void {
    setHttpRequestTransport(this);
  }

  getHeaders({ method }: { method: string }): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (!isKiBuddyCoreSafeMethod(method)) {
      headers['x-csrf-token'] = this.csrfToken;
      headers.Cookie = `aionui-csrf-token=${this.csrfToken}`;
    }
    return headers;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  clearAccessToken(): void {
    this.accessToken = null;
  }
}
