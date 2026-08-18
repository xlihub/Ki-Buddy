/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { initApplicationBridge } from './applicationBridge';
import { initDialogBridge } from './dialogBridge';
import { initUpdateBridge } from './updateBridge';
import { initPetSettingsBridge, initSystemSettingsBridge } from './systemSettingsBridge';
import { initWindowControlsBridge } from './windowControlsBridge';
import { initNotificationBridge } from './notificationBridge';
import { initWebuiBridge } from './webuiBridge';
import { initThemeBridge } from './themeBridge';
import type { ProductExperience } from '@/common/platform/ki-buddy';

export type BridgeDependencies = Readonly<{
  productExperience: ProductExperience;
}>;

export function initAllBridges({ productExperience }: BridgeDependencies): void {
  initDialogBridge();
  initApplicationBridge();
  initWindowControlsBridge();
  initUpdateBridge();
  initSystemSettingsBridge();
  initNotificationBridge();
  initThemeBridge();
  if (productExperience.featureState('desktopPet') === 'enabled') initPetSettingsBridge();
  if (productExperience.featureState('webUi') === 'enabled') initWebuiBridge();
}

export {
  initApplicationBridge,
  initDialogBridge,
  initNotificationBridge,
  initSystemSettingsBridge,
  initPetSettingsBridge,
  initThemeBridge,
  initUpdateBridge,
  initWindowControlsBridge,
  initWebuiBridge,
};
export { registerWindowMaximizeListeners } from './windowControlsBridge';
export const disposeAllTeamSessions = (): Promise<void> => Promise.resolve();
