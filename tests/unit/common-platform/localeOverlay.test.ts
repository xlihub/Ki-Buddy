import { describe, expect, it } from 'vitest';
import i18nConfig from '@/common/config/i18n-config.json';
import { applyKiBuddyLocaleOverlay, KI_BUDDY_LOCALE_BUNDLE } from '@/common/platform/ki-buddy/localeOverlay';

const identity = { namespace: 'kiBuddy', productName: 'Ki-Buddy', cliName: 'Ki CLI', language: 'en-US' as const };

describe('Ki-Buddy locale overlay', () => {
  it('applies only registered product and CLI paths', () => {
    const source = {
      common: { 'tray.showWindow': 'Show AionUi' },
      conversation: {
        welcome: { quickActionStar: 'Like AionUi? Give us a star!' },
        agentError: {
          codes: {
            WORKSPACE_PATH_CONTAINS_WHITESPACE_RUNTIME_UNSUPPORTED: {
              body: 'AionUi no longer supports this path.',
              bodyWithPath: 'AionUi no longer supports {{workspacePath}}.',
            },
          },
        },
      },
      settings: {
        agentManagement: { localAgentsDescription: 'Aion CLI is built in' },
        myAssistantsEmpty: 'Let AionUi discover local CLI tools.',
        talkToButler: { enabledToast: 'Enabled the AionUi Butler for you' },
      },
      update: { migration: { letter: { signature: 'The AionUi Team' } } },
    };

    const overlay = applyKiBuddyLocaleOverlay(source, identity);

    expect(overlay.common).toEqual({ 'tray.showWindow': 'Show Ki-Buddy' });
    expect(overlay.conversation).toEqual({
      welcome: { quickActionStar: 'Like Ki-Buddy? Give us a star!' },
      agentError: {
        codes: {
          WORKSPACE_PATH_CONTAINS_WHITESPACE_RUNTIME_UNSUPPORTED: {
            body: 'Ki-Buddy no longer supports this path.',
            bodyWithPath: 'Ki-Buddy no longer supports {{workspacePath}}.',
          },
        },
      },
    });
    expect(overlay.settings).toEqual({
      agentManagement: { localAgentsDescription: 'Ki CLI is built in' },
      myAssistantsEmpty: 'Let Ki-Buddy discover local CLI tools.',
      talkToButler: { enabledToast: 'Enabled the Butler for you' },
    });
    expect(overlay.update).toEqual({ migration: { letter: { signature: 'The AionUi Team' } } });
  });

  it('does not mutate the upstream locale object', () => {
    const source = { common: { 'tray.showWindow': 'Show AionUi' } };
    applyKiBuddyLocaleOverlay(source, identity);
    expect(source.common['tray.showWindow']).toBe('Show AionUi');
  });

  it.each([
    ['de-DE', 'AionUi-Butler für dich aktiviert', 'Butler für dich aktiviert'],
    ['pt-BR', 'Mordomo do AionUi ativado para você', 'Mordomo ativado para você'],
    ['zh-CN', '已为你启用 AionUi 管家', '已为你启用管家'],
  ] as const)('uses a complete neutral assistant message for %s', (language, upstream, expected) => {
    const overlay = applyKiBuddyLocaleOverlay(
      { settings: { talkToButler: { enabledToast: upstream } } },
      { ...identity, language }
    );

    expect(overlay.settings).toEqual({ talkToButler: { enabledToast: expected } });
  });

  it('defines the product locale key for every supported language', () => {
    expect(Object.keys(KI_BUDDY_LOCALE_BUNDLE.resources).toSorted()).toEqual(i18nConfig.supportedLanguages.toSorted());
  });

  it('rejects a language missing from the product locale bundle', () => {
    expect(() => applyKiBuddyLocaleOverlay({}, { ...identity, language: 'missing' })).toThrow(
      'Missing Ki-Buddy locale bundle: missing'
    );
  });

  it('rejects an unregistered product locale namespace', () => {
    expect(() => applyKiBuddyLocaleOverlay({}, { ...identity, namespace: 'unknown' })).toThrow(
      'Unsupported Ki-Buddy locale namespace'
    );
  });
});
