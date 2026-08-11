import { Button, Divider, Typography } from '@arco-design/web-react';
import { ReplayFive } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import SettingsPageWrapper from '@/renderer/pages/settings/components/SettingsPageWrapper';
import { replayKiBuddyOpeningGuide } from './onboarding';

const KiBuddyAboutSettings: React.FC = () => {
  const { t } = useTranslation();
  return (
    <SettingsPageWrapper contentClassName='max-w-640px'>
      <AboutModalContent />
      <Divider className='my-20px' />
      <section className='flex items-center justify-between gap-20px rounded-12px border border-b-base bg-bg-2 p-20px'>
        <div className='min-w-0'>
          <Typography.Title heading={6} className='!mb-4px'>
            {t('login.onboarding.replayTitle')}
          </Typography.Title>
          <Typography.Text type='secondary'>{t('login.onboarding.replayDescription')}</Typography.Text>
        </div>
        <Button icon={<ReplayFive theme='outline' />} onClick={replayKiBuddyOpeningGuide}>
          {t('login.onboarding.replay')}
        </Button>
      </section>
    </SettingsPageWrapper>
  );
};

export default KiBuddyAboutSettings;
