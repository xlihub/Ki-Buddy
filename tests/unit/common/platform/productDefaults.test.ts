/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { KI_BUDDY_DEFAULT_LANGUAGE, resolveLanguagePreference } from '@/common/platform/ki-buddy';

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

  it('rejects an unsupported saved language without changing the global fallback', () => {
    expect(resolveLanguagePreference({ savedLanguage: 'invalid-language' })).toBe('en-US');
  });
});
