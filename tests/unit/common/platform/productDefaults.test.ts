/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  KI_BUDDY_DEFAULT_AGENTS_BASE_URL,
  KI_BUDDY_DEFAULT_LANGUAGE,
  normalizeAgentsBaseUrl,
  resolveLanguagePreference,
} from '@/common/platform/ki-buddy';

describe('Ki-Buddy language preference', () => {
  it('uses Chinese for a new Ki-Buddy user on an English system', () => {
    expect(
      resolveLanguagePreference({
        productLanguage: KI_BUDDY_DEFAULT_LANGUAGE,
        systemLanguage: 'en-US',
      })
    ).toBe('zh-CN');
  });

  it('keeps a saved English preference', () => {
    expect(
      resolveLanguagePreference({
        savedLanguage: 'en-US',
        productLanguage: KI_BUDDY_DEFAULT_LANGUAGE,
        systemLanguage: 'zh-CN',
      })
    ).toBe('en-US');
  });

  it('keeps upstream AionUi system-language behavior without a product default', () => {
    expect(resolveLanguagePreference({ systemLanguage: 'ja-JP' })).toBe('ja-JP');
  });

  it('uses the public Agents deployment by default', () => {
    expect(KI_BUDDY_DEFAULT_AGENTS_BASE_URL).toBe('https://ksapi.kingsware.cn');
  });

  it('rejects an unsupported saved language without changing the global fallback', () => {
    expect(resolveLanguagePreference({ savedLanguage: 'invalid-language' })).toBe('en-US');
  });

  it('normalizes deployment URLs identically for main-process requests and renderer history', () => {
    expect(normalizeAgentsBaseUrl(' https://AGENTS.example.com/path/ ')).toBe('https://agents.example.com/path');
  });

  it.each(['ftp://agents.example.com', 'https://user:secret@agents.example.com', 'not-a-url'])(
    'rejects unsafe Agents deployment URL %s',
    (value) => {
      expect(normalizeAgentsBaseUrl(value)).toBeNull();
    }
  );
});
