import { Avatar, Button, Dropdown, Message, Tooltip } from '@arco-design/web-react';
import { Copy, MoreOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { KiBuddyAgentsProfile } from '@/common/types/platform/kiBuddyAuth';
import styles from './Account.module.css';

type AccountCardProps = {
  profile: KiBuddyAgentsProfile;
  onRequestLogout: () => void;
};

type DetailItem = {
  label: string;
  value: string;
  copyable?: boolean;
};

function accountInitial(profile: KiBuddyAgentsProfile): string {
  return (profile.displayName || profile.username || profile.userId).trim().charAt(0).toUpperCase() || 'K';
}

const AccountCard: React.FC<AccountCardProps> = ({ profile, onRequestLogout }) => {
  const { t } = useTranslation();
  const secondaryIdentity = profile.email ?? profile.username;
  const details: DetailItem[] = [
    { label: t('login.account.userId'), value: profile.userId, copyable: true },
    ...(profile.email ? [{ label: t('login.account.email'), value: profile.email }] : []),
    ...(profile.phone ? [{ label: t('login.account.phone'), value: profile.phone }] : []),
    ...(profile.organization ? [{ label: t('login.account.organization'), value: profile.organization }] : []),
    ...(profile.roles.length > 0
      ? [{ label: t('login.account.roles'), value: profile.roles.join(t('login.account.roleSeparator')) }]
      : []),
    { label: t('login.account.deployment'), value: profile.deploymentUrl },
  ];

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(profile.userId);
      Message.success(t('common.copySuccess'));
    } catch {
      Message.error(t('common.copyFailed'));
    }
  };

  const menu = (
    <div
      className={`min-w-120px rd-12px border border-solid border-[var(--color-border-2)] bg-base p-4px ${styles.menuPopup}`}
    >
      <Button
        type='text'
        data-testid='ki-buddy-account-logout-menu-item'
        className='!h-auto !w-full !flex !items-center !justify-start !rd-8px !border-none !bg-transparent !px-12px !py-8px !text-13px !leading-20px !text-danger cursor-pointer transition-colors hover:!bg-[rgba(var(--danger-6),0.1)]'
        onClick={onRequestLogout}
      >
        {t('login.account.logout')}
      </Button>
    </div>
  );

  return (
    <section data-testid='ki-buddy-account-card' className='bg-2 rd-20px p-20px md:p-24px'>
      <div className='flex items-start justify-between gap-16px'>
        <div className='min-w-0 flex items-center gap-16px'>
          <Avatar size={56} className={styles.avatar} aria-label={profile.displayName}>
            {accountInitial(profile)}
          </Avatar>
          <div className='min-w-0'>
            <div className='m-0 truncate text-15px leading-22px font-600 text-t-primary'>{profile.displayName}</div>
            <div className='mt-2px truncate text-12px leading-18px text-t-tertiary'>{secondaryIdentity}</div>
          </div>
        </div>
        <Dropdown droplist={menu} trigger='click' position='br' triggerProps={{ popupAlign: { top: 6 } }}>
          <Button
            data-testid='ki-buddy-account-menu-button'
            type='text'
            shape='circle'
            size='small'
            className='!h-36px !w-36px !rounded-12px !px-0 shrink-0 text-t-tertiary hover:!bg-2 hover:!text-t-primary'
            icon={<MoreOne theme='outline' size={18} />}
            aria-label={t('login.account.openMenu')}
          />
        </Dropdown>
      </div>

      <div className='mt-20px border-t border-solid border-b-base border-l-0 border-r-0 border-b-0 pt-18px'>
        <dl className='m-0 grid grid-cols-1 gap-x-32px gap-y-16px md:grid-cols-2'>
          {details.map((item) => (
            <div key={item.label} className='min-w-0'>
              <dt className='mb-4px text-12px text-t-tertiary'>{item.label}</dt>
              <dd className='m-0 flex min-w-0 items-center gap-6px text-14px text-t-primary'>
                <span className={item.copyable ? 'min-w-0 truncate font-mono' : 'min-w-0 break-words'}>
                  {item.value}
                </span>
                {item.copyable ? (
                  <Tooltip content={t('login.account.copyUserId')}>
                    <Button
                      type='text'
                      shape='circle'
                      size='mini'
                      className='shrink-0'
                      icon={<Copy theme='outline' />}
                      aria-label={t('login.account.copyUserId')}
                      onClick={() => void copyUserId()}
                    />
                  </Tooltip>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
};

export default AccountCard;
