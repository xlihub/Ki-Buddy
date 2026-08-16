import { Alert, Button, Form, Input, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KI_BUDDY_DEFAULT_AGENTS_BASE_URL } from '@/common/platform/ki-buddy';
import { useKiBuddyAuth } from '../Auth';
import DeploymentUrlField from './DeploymentUrlField';
import { readDeploymentHistory, recordSuccessfulDeployment } from './deploymentHistory';
import { KI_BUDDY_LOGIN_ERROR_KEYS, normalizeKiBuddyLoginErrorCode, type KiBuddyLoginErrorCode } from './loginErrors';
import { getRendererBrand } from '@/renderer/services/runtime/productBrandRuntime';
import styles from './LoginPage.module.css';

type LoginFormValues = {
  baseUrl: string;
  loginName: string;
  password: string;
};

const KiBuddyLoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login } = useKiBuddyAuth();
  const brand = getRendererBrand();
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<KiBuddyLoginErrorCode | null>(null);
  const [deploymentHistory] = useState(readDeploymentHistory);
  const requiredRule = { required: true, message: t('login.kiBuddy.form.required') };

  useEffect(() => {
    document.title = t('login.kiBuddy.pageTitle', { productName: brand.productName });
  }, [brand.productName, t]);

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
    <main className={styles.shell}>
      <section className={styles.formStage} aria-labelledby='ki-buddy-login-title'>
        <div className={styles.formFrame}>
          <img className={styles.logo} src={brand.logoUrl} alt='' />
          <Typography.Title id='ki-buddy-login-title' heading={2} className={styles.formTitle}>
            {t('login.kiBuddy.welcome')}
          </Typography.Title>
          <Form<LoginFormValues>
            className={styles.form}
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
              <Input
                size='large'
                allowClear
                placeholder={t('login.kiBuddy.accountOrEmailPlaceholder')}
                autoComplete='username'
              />
            </Form.Item>
            <Form.Item field='password' label={t('login.password')} rules={[requiredRule]}>
              <Input.Password
                size='large'
                placeholder={t('login.passwordPlaceholder')}
                autoComplete='current-password'
              />
            </Form.Item>
            <Button className={styles.submit} type='primary' size='large' htmlType='submit' long loading={loading}>
              {loading ? t('login.submitting') : t('login.submit')}
            </Button>
            {errorCode ? (
              <Alert className='mt-16px' type='error' content={t(KI_BUDDY_LOGIN_ERROR_KEYS[errorCode])} />
            ) : null}
          </Form>
        </div>
      </section>

      <section className={styles.brandStage} aria-label={brand.productName}>
        <div className={styles.orbitLarge} aria-hidden='true' />
        <div className={styles.orbitSmall} aria-hidden='true' />
        <div className={styles.brandContent}>
          <div className={styles.mascotFrame}>
            <img className={styles.mascot} src={brand.mascotUrl} alt='' data-testid='ki-buddy-login-mascot' />
          </div>
          <div className={styles.brandCopy}>
            <Typography.Title heading={1} className={styles.brandTitle}>
              {brand.productName}
            </Typography.Title>
            <Typography.Title heading={4} className={styles.brandTagline}>
              {t('login.kiBuddy.onboarding.assistantFlowTitle')}
            </Typography.Title>
            <Typography.Paragraph className={styles.brandDescription}>
              {t('login.kiBuddy.onboarding.assistantFlowDescription')}
            </Typography.Paragraph>
          </div>
        </div>
        <div className={styles.wordmark} aria-hidden='true'>
          {brand.productName}
        </div>
      </section>
    </main>
  );
};

export default KiBuddyLoginPage;
