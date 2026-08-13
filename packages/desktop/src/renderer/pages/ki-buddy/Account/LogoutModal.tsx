import { Modal, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type LogoutModalProps = {
  visible: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const LogoutModal: React.FC<LogoutModalProps> = ({ visible, loading, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      modalRender={(node) => (
        <div data-testid='ki-buddy-account-logout-modal' className='contents'>
          {node}
        </div>
      )}
      title={t('login.kiBuddy.account.logoutTitle')}
      onCancel={onCancel}
      onOk={onConfirm}
      confirmLoading={loading}
      cancelText={t('common.cancel')}
      okText={t('login.kiBuddy.account.logout')}
    >
      <Typography.Paragraph className='!mb-0 text-t-secondary'>
        {t('login.kiBuddy.account.logoutDescription')}
      </Typography.Paragraph>
    </Modal>
  );
};

export default LogoutModal;
