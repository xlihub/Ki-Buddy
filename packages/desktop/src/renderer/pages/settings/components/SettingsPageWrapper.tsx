import classNames from 'classnames';
import React from 'react';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import {
  SettingsTabNavigateProvider,
  SettingsViewModeProvider,
} from '@/renderer/components/settings/SettingsModal/settingsViewContext';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import { Puzzle } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { getSettingsNavigationProjection, mergeExtensionSettingsItems, type SettingsNavItem } from './SettingsSider';
import { Button } from '@arco-design/web-react';
import './settings.css';

type SettingsPageWrapperProps = {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

type MobileSettingsNavProps = Readonly<{
  items: readonly SettingsNavItem[];
  navigateToPath: (path: string) => void;
  pathname: string;
}>;

const MobileSettingsNav: React.FC<MobileSettingsNavProps> = ({ items, navigateToPath, pathname }) => (
  <div className='settings-mobile-top-nav'>
    {items.map((item) => {
      const active = pathname.includes(`/settings/${item.path}`);
      return (
        <Button
          key={item.path}
          type='text'
          className={classNames('settings-mobile-top-nav__item', {
            'settings-mobile-top-nav__item--active': active,
          })}
          onClick={() => navigateToPath(item.path)}
        >
          <span className='settings-mobile-top-nav__icon'>{item.icon}</span>
          <span className='settings-mobile-top-nav__label'>{item.label}</span>
        </Button>
      );
    })}
  </div>
);

const ExtensionAwareMobileSettingsNav: React.FC<MobileSettingsNavProps> = ({ items, navigateToPath, pathname }) => {
  const extensionTabs = useExtensionSettingsTabs();
  const { resolveExtTabName } = useExtI18n();
  const menuItems = React.useMemo(
    () =>
      mergeExtensionSettingsItems(items, extensionTabs, (tab: IExtensionSettingsTab) => {
        const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
        return {
          id: tab.id,
          label: resolveExtTabName(tab),
          icon: resolvedIcon ? (
            <img src={resolvedIcon} alt='' className='w-16px h-16px object-contain' />
          ) : (
            <Puzzle theme='outline' size='16' />
          ),
          path: `ext/${tab.id}`,
        };
      }),
    [extensionTabs, items, resolveExtTabName]
  );

  return <MobileSettingsNav items={menuItems} navigateToPath={navigateToPath} pathname={pathname} />;
};

const SettingsPageWrapper: React.FC<SettingsPageWrapperProps> = ({ children, className, contentClassName }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  const { extensionSettingsEnabled, items: builtinItems } = React.useMemo(
    () => getSettingsNavigationProjection(isDesktop, t),
    [isDesktop, t]
  );

  const containerClass = classNames(
    'settings-page-wrapper w-full min-h-full box-border overflow-y-auto',
    isMobile ? 'px-16px' : 'px-12px md:px-40px',
    className
  );
  const contentClass = classNames(
    'settings-page-content mx-auto w-full md:max-w-1024px py-14px md:py-32px',
    contentClassName
  );

  const navigateToPath = React.useCallback(
    (path: string) => {
      void navigate(`/settings/${path}`, { replace: true });
    },
    [navigate]
  );

  const navigateToTab = React.useCallback(
    (tabId: string) => {
      navigateToPath(tabId);
    },
    [navigateToPath]
  );

  return (
    <SettingsViewModeProvider value='page'>
      <SettingsTabNavigateProvider value={navigateToTab}>
        <div className={containerClass}>
          {isMobile &&
            (extensionSettingsEnabled ? (
              <ExtensionAwareMobileSettingsNav
                items={builtinItems}
                navigateToPath={navigateToPath}
                pathname={pathname}
              />
            ) : (
              <MobileSettingsNav items={builtinItems} navigateToPath={navigateToPath} pathname={pathname} />
            ))}
          <div className={contentClass}>{children}</div>
        </div>
      </SettingsTabNavigateProvider>
    </SettingsViewModeProvider>
  );
};

export default SettingsPageWrapper;
