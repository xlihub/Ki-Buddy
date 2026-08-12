import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { getUserConversationsMock } = vi.hoisted(() => ({
  getUserConversationsMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      writeRendererLog: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
    conversation: {
      listChanged: { on: vi.fn() },
      responseStream: { on: vi.fn() },
      turnCompleted: { on: vi.fn() },
    },
    database: {
      getUserConversations: { invoke: getUserConversationsMock },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  addEventListener: vi.fn(),
}));

import { useConversationListSync } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import { resetAccountScopedRendererState } from '@/renderer/services/runtime/accountStateLifecycle';

describe('conversation list account lifecycle', () => {
  it('removes the previous account snapshot before loading the new account conversations', async () => {
    getUserConversationsMock
      .mockResolvedValueOnce({ items: [{ id: 'old-conversation', title: 'Old account' }] })
      .mockResolvedValueOnce({ items: [{ id: 'new-conversation', title: 'New account' }] });
    const { result } = renderHook(() => useConversationListSync());
    await waitFor(() => expect(result.current.conversations.map(({ id }) => id)).toEqual(['old-conversation']));

    act(() => resetAccountScopedRendererState());

    expect(result.current.conversations).toEqual([]);
    await waitFor(() => expect(result.current.conversations.map(({ id }) => id)).toEqual(['new-conversation']));
  });
});
