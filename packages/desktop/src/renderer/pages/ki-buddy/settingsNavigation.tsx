import { User } from '@icon-park/react';
import React from 'react';

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

/** Builds the product-only account settings navigation item. */
export function createKiBuddyAccountSettingsItem(t: TranslateFn) {
  return {
    id: 'account',
    label: t('login.account.title'),
    icon: <User theme='outline' size='16' />,
    path: 'account',
  };
}
