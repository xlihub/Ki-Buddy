import { Alert, Button, Form, Input, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KI_BUDDY_DEFAULT_AGENTS_BASE_URL } from '@/common/platform/ki-buddy';
import { useKiBuddyAuth } from './Auth';
import DeploymentUrlField from './DeploymentUrlField';
import { readDeploymentHistory, recordSuccessfulDeployment } from './deploymentHistory';
import { KI_BUDDY_LOGIN_ERROR_KEYS, normalizeKiBuddyLoginErrorCode, type KiBuddyLoginErrorCode } from './loginErrors';

type LoginFormValues = {
  baseUrl: string;
  loginName: string;
  password: string;
};

const KiBuddyLoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login } = useKiBuddyAuth();
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<KiBuddyLoginErrorCode | null>(null);
  const [deploymentHistory] = useState(readDeploymentHistory);
  const requiredRule = { required: true, message: t('login.kiBuddy.form.required') };

  useEffect(() => {
    document.title = t('login.kiBuddy.pageTitle');
  }, [t]);

  const handleSubmit = useCallback(
    async (values: LoginFormValues) => {
      setLoading(true);
      setErrorCode(null);
      try {
        const result = await login({
          baseUrl: values.baseUrl.trim(),
          username: values.loginName.trim(),
          password: values.password,
        });
        if (!result.success) {
          setErrorCode(normalizeKiBuddyLoginErrorCode(result.code));
          return;
        }
        recordSuccessfulDeployment(values.baseUrl);
      } finally {
        setLoading(false);
      }
    },
    [login]
  );

  return (
    <main className='h-screen w-screen flex items-center justify-center bg-bg-1 px-24px'>
      <section className='w-full max-w-420px rounded-16px bg-bg-2 p-32px shadow-lg'>
        <Typography.Title heading={3}>{t('login.kiBuddy.brand')}</Typography.Title>
        <Typography.Paragraph type='secondary'>{t('login.kiBuddy.subtitle')}</Typography.Paragraph>
        <Form<LoginFormValues>
          layout='vertical'
          initialValues={{
            baseUrl: deploymentHistory.lastSuccessful ?? KI_BUDDY_DEFAULT_AGENTS_BASE_URL ?? '',
          }}
          onSubmit={handleSubmit}
        >
          <Form.Item field='baseUrl' label={t('login.kiBuddy.agentsDeployment')} rules={[requiredRule]}>
            <DeploymentUrlField
              history={deploymentHistory}
              inputLabel={t('login.kiBuddy.agentsDeployment')}
              clearLabel={t('login.kiBuddy.clearDeployment')}
              lastSuccessfulLabel={t('login.kiBuddy.lastSuccessfulDeployment')}
              placeholder={t('login.kiBuddy.baseUrlPlaceholder')}
            />
          </Form.Item>
          <Form.Item field='loginName' label={t('login.kiBuddy.accountOrEmail')} rules={[requiredRule]}>
            <Input placeholder={t('login.kiBuddy.accountOrEmailPlaceholder')} autoComplete='username' />
          </Form.Item>
          <Form.Item field='password' label={t('login.password')} rules={[requiredRule]}>
            <Input.Password placeholder={t('login.passwordPlaceholder')} autoComplete='current-password' />
          </Form.Item>
          <Button type='primary' htmlType='submit' long loading={loading}>
            {loading ? t('login.submitting') : t('login.submit')}
          </Button>
          {errorCode ? (
            <Alert className='mt-16px' type='error' content={t(KI_BUDDY_LOGIN_ERROR_KEYS[errorCode])} />
          ) : null}
        </Form>
      </section>
    </main>
  );
};

export default KiBuddyLoginPage;
