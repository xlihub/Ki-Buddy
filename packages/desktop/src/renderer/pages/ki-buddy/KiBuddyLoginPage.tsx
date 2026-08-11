import { Alert, Button, Form, Input, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/renderer/hooks/context/AuthContext';

type LoginFormValues = {
  baseUrl: string;
  loginName: string;
  password: string;
};

type LoginErrorCode = 'invalidCredentials' | 'networkError' | 'serverError' | 'contractError' | 'unknown';

function toLoginErrorCode(code: string | undefined): LoginErrorCode {
  switch (code) {
    case 'invalidCredentials':
    case 'networkError':
    case 'serverError':
    case 'contractError':
      return code;
    default:
      return 'unknown';
  }
}

const KiBuddyLoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<LoginErrorCode | null>(null);
  const requiredRule = { required: true, message: t('login.errors.required') };

  useEffect(() => {
    document.title = t('login.kiBuddyPageTitle');
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
          setErrorCode(toLoginErrorCode(result.code));
        }
      } finally {
        setLoading(false);
      }
    },
    [login]
  );

  return (
    <main className='h-screen w-screen flex items-center justify-center bg-bg-1 px-24px'>
      <section className='w-full max-w-420px rounded-16px bg-bg-2 p-32px shadow-lg'>
        <Typography.Title heading={3}>{t('login.kiBuddyBrand')}</Typography.Title>
        <Typography.Paragraph type='secondary'>{t('login.kiBuddySubtitle')}</Typography.Paragraph>
        <Form<LoginFormValues> layout='vertical' onSubmit={handleSubmit}>
          <Form.Item field='baseUrl' label={t('login.agentsDeployment')} rules={[requiredRule]}>
            <Input placeholder={t('login.baseUrlPlaceholder')} autoComplete='url' />
          </Form.Item>
          <Form.Item field='loginName' label={t('login.accountOrEmail')} rules={[requiredRule]}>
            <Input placeholder={t('login.accountOrEmailPlaceholder')} autoComplete='username' />
          </Form.Item>
          <Form.Item field='password' label={t('login.password')} rules={[requiredRule]}>
            <Input.Password placeholder={t('login.passwordPlaceholder')} autoComplete='current-password' />
          </Form.Item>
          <Button type='primary' htmlType='submit' long loading={loading}>
            {loading ? t('login.submitting') : t('login.submit')}
          </Button>
          {errorCode ? (
            <Alert
              className='mt-16px'
              type='error'
              content={
                errorCode === 'invalidCredentials'
                  ? t('login.errors.invalidCredentials')
                  : errorCode === 'networkError'
                    ? t('login.errors.networkError')
                    : errorCode === 'serverError'
                      ? t('login.errors.serverError')
                      : errorCode === 'contractError'
                        ? t('login.errors.contractError')
                        : t('login.errors.unknown')
              }
            />
          ) : null}
        </Form>
      </section>
    </main>
  );
};

export default KiBuddyLoginPage;
