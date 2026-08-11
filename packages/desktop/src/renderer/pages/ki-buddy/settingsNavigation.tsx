import { User } from '@icon-park/react';
import React from 'react';
import { isKiBuddyDesktopRuntime } from '@/renderer/utils/platform';

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

/** Builds the product-only account settings navigation item when Ki-Buddy is active. */
export function getKiBuddyAccountSettingsItem(t: TranslateFn) {
  if (!isKiBuddyDesktopRuntime()) return null;
  return {
    id: 'account',
    label: t('login.account.title'),
    icon: <User theme='outline' size='16' />,
    path: 'account',
  };
}
