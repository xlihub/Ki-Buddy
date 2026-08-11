import { Button, Divider, Typography } from '@arco-design/web-react';
import { ReplayFive } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import SettingsPageWrapper from '@/renderer/pages/settings/components/SettingsPageWrapper';
import { replayKiBuddyOpeningGuide } from '../onboarding';
import AccountCard from './AccountCard';
import LogoutModal from './LogoutModal';

const KiBuddyAccountSettings: React.FC = () => {
  const { t } = useTranslation();
  const { logout, user } = useAuth();
  const { clearPreviewForScope, closePreview } = usePreviewContext();
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  if (!user?.agents) return null;

  const handleLogout = async () => {
    setLogoutLoading(true);
    closePreview();
    await logout();
    clearPreviewForScope();
  };

  return (
    <SettingsPageWrapper contentClassName='max-w-1024px'>
      <div className='space-y-20px'>
        <h2 className='m-0 text-20px font-600 text-t-primary'>{t('login.account.title')}</h2>
        <AccountCard profile={user.agents} onRequestLogout={() => setLogoutVisible(true)} />
        <Divider className='!my-24px' />
        <section className='flex flex-col justify-between gap-16px px-4px sm:flex-row sm:items-center'>
          <div className='min-w-0'>
            <Typography.Title heading={6} className='!mb-4px'>
              {t('login.onboarding.replayTitle')}
            </Typography.Title>
            <Typography.Text type='secondary'>{t('login.onboarding.replayDescription')}</Typography.Text>
          </div>
          <Button
            className='shrink-0 self-start sm:self-auto'
            icon={<ReplayFive theme='outline' />}
            onClick={replayKiBuddyOpeningGuide}
          >
            {t('login.onboarding.replay')}
          </Button>
        </section>
      </div>
      <LogoutModal
        visible={logoutVisible}
        loading={logoutLoading}
        onCancel={() => setLogoutVisible(false)}
        onConfirm={() => void handleLogout()}
      />
    </SettingsPageWrapper>
  );
};

export default KiBuddyAccountSettings;
