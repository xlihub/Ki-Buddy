import { Button, Typography } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AssistantFlowStep from './AssistantFlowStep';
import CapabilityStep from './CapabilityStep';
import ToolSupportStep from './ToolSupportStep';
import styles from './onboarding.module.css';

type OpeningGuideProps = {
  onFinish: () => void;
};

const STEPS = [
  { title: 'toolSupportTitle', description: 'toolSupportDescription', content: <ToolSupportStep /> },
  { title: 'assistantFlowTitle', description: 'assistantFlowDescription', content: <AssistantFlowStep /> },
  { title: 'capabilityTitle', description: 'capabilityDescription', content: <CapabilityStep /> },
] as const;

const OpeningGuide: React.FC<OpeningGuideProps> = ({ onFinish }) => {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];

  return (
    <main className={styles.shell}>
      <section className={styles.guide} aria-labelledby='ki-buddy-opening-guide-title'>
        <div className={styles.topline}>
          <span className={styles.brand}>{t('login.kiBuddy.brand')}</span>
          <Button type='text' onClick={onFinish}>
            {t('login.kiBuddy.onboarding.skip')}
          </Button>
        </div>
        <div className={styles.copy}>
          <Typography.Title id='ki-buddy-opening-guide-title' heading={2} className={styles.title}>
            {t(`login.kiBuddy.onboarding.${step.title}`)}
          </Typography.Title>
          <Typography.Paragraph className={styles.description}>
            {t(`login.kiBuddy.onboarding.${step.description}`)}
          </Typography.Paragraph>
        </div>
        <div className={styles.visual}>{step.content}</div>
        <div className={styles.footer}>
          <div className={styles.dots} role='group' aria-label={t('login.kiBuddy.onboarding.progressLabel')}>
            {STEPS.map((item, index) => (
              <Button
                key={item.title}
                type='text'
                shape='circle'
                size='mini'
                className={index === stepIndex ? styles.activeDot : styles.dot}
                aria-label={t('login.kiBuddy.onboarding.stepLabel', { current: index + 1, total: STEPS.length })}
                aria-current={index === stepIndex ? 'step' : undefined}
                onClick={() => setStepIndex(index)}
              />
            ))}
          </div>
          <Button
            type='primary'
            onClick={() => {
              if (stepIndex === STEPS.length - 1) {
                onFinish();
              } else {
                setStepIndex((current) => current + 1);
              }
            }}
          >
            {stepIndex === STEPS.length - 1 ? t('login.kiBuddy.onboarding.start') : t('login.kiBuddy.onboarding.next')}
          </Button>
        </div>
      </section>
    </main>
  );
};

export default OpeningGuide;
