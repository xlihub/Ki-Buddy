/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Link, Space, Typography } from '@arco-design/web-react';
import { IconExclamationCircle } from '@arco-design/web-react/icon';
import React from 'react';
import { getRendererBrand } from '@/renderer/services/runtime/productBrandRuntime';
import { useTranslation } from 'react-i18next';

const { Paragraph, Text } = Typography;

interface ChannelConflictWarningProps {
  platform: 'lark' | 'telegram';
  openclawConfigPath: string;
  onDisableOpenClaw?: () => void;
  onIgnore?: () => void;
}

/**
 * Warning component when OpenClaw channel conflicts with AionUi Channels
 */
export const ChannelConflictWarning: React.FC<ChannelConflictWarningProps> = ({
  platform,
  openclawConfigPath,
  onDisableOpenClaw,
  onIgnore,
}) => {
  const { t } = useTranslation();
  const platformName = platform === 'lark' ? 'Lark/Feishu' : 'Telegram';
  const channelKey = platform === 'lark' ? 'feishu' : 'telegram';
  const productName = getRendererBrand().productName;

  return (
    <Alert
      type='warning'
      icon={<IconExclamationCircle />}
      title={t('agent.channelConflict.title', { platformName })}
      content={
        <Space direction='vertical' size='medium' style={{ width: '100%' }}>
          <Paragraph>
            <Text bold>{t('agent.channelConflict.handling', { platformName, productName })}</Text>
          </Paragraph>

          <Paragraph>
            {t('agent.channelConflict.credentialsIntro', { platformName })}
            <ul>
              <li>
                <Text type='error'>{t('agent.channelConflict.switchingNoEffect', { productName })}</Text>
              </li>
              <li>
                <Text type='error'>{t('agent.channelConflict.messagesProcessed')}</Text>
              </li>
              <li>
                <Text type='success'>{t('agent.channelConflict.messagesStillWork')}</Text>
              </li>
            </ul>
          </Paragraph>

          <Paragraph>
            <Text bold>{t('agent.channelConflict.useChannels', { productName })}</Text>
          </Paragraph>

          <Paragraph>
            <Text type='secondary'>{t('agent.channelConflict.optionDisable', { platformName })}</Text>
            <br />
            {t('agent.channelConflict.edit')} <Text code>{openclawConfigPath}</Text>
            <br />
            {t('agent.channelConflict.set')} <Text code>{`channels.${channelKey}.enabled = false`}</Text>
            <br />
            {t('agent.channelConflict.restart', { productName })}
          </Paragraph>

          <Paragraph>
            <Text type='secondary'>{t('agent.channelConflict.optionDifferentBot')}</Text>
            <br />
            {t('agent.channelConflict.createDifferentBot', { platformName, productName })}
          </Paragraph>

          <Paragraph>
            <Text type='secondary'>{t('agent.channelConflict.optionKeepOpenClaw')}</Text>
            <br />
            {t('agent.channelConflict.disableChannels', { platformName, productName })}
          </Paragraph>

          <Space>
            {onDisableOpenClaw && (
              <Button type='primary' onClick={onDisableOpenClaw}>
                {t('agent.channelConflict.helpDisable', { platformName })}
              </Button>
            )}
            {onIgnore && (
              <Button type='text' onClick={onIgnore}>
                {t('agent.channelConflict.ignore')}
              </Button>
            )}
          </Space>
        </Space>
      }
      closable={false}
      style={{ marginBottom: 16 }}
    />
  );
};

/**
 * Compact warning banner (for settings page)
 */
export const ChannelConflictBanner: React.FC<{ platform: 'lark' | 'telegram'; onLearnMore: () => void }> = ({
  platform,
  onLearnMore,
}) => {
  const { t } = useTranslation();
  const platformName = platform === 'lark' ? 'Lark/Feishu' : 'Telegram';

  return (
    <Alert
      type='warning'
      content={
        <Space>
          <Text>{t('agent.channelConflict.banner', { platformName })}</Text>
          <Link onClick={onLearnMore}>{t('agent.channelConflict.learnMore')}</Link>
        </Space>
      }
      closable
      style={{ marginBottom: 12 }}
    />
  );
};
