/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TProviderWithModel } from '@/common/config/storage';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';
import { useEffect, useRef } from 'react';

const DRAFT_CONVERSATION_KEY = 'guid_draft_conversation';

export type DraftConversationEntry = {
  conversationId: string;
  workspace: string;
  assistantId: string;
};

export function getDraftConversation(): DraftConversationEntry | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_CONVERSATION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setDraftConversation(entry: DraftConversationEntry | null): void {
  if (entry) {
    sessionStorage.setItem(DRAFT_CONVERSATION_KEY, JSON.stringify(entry));
  } else {
    sessionStorage.removeItem(DRAFT_CONVERSATION_KEY);
  }
}

export function clearDraftConversation(): void {
  sessionStorage.removeItem(DRAFT_CONVERSATION_KEY);
}

export type UseGuidDraftConversationDeps = {
  dir: string;
  selectedAssistantId: string | null;
  selectedAssistantBackend: string;
  current_model: TProviderWithModel | undefined;
};

/**
 * Creates a draft conversation and warms it up when a workspace is selected
 * for an ACP backend assistant (like OpenCode). This starts the agent process
 * immediately so that project-level custom agents become discoverable before
 * the user sends their first message.
 */
export const useGuidDraftConversation = (deps: UseGuidDraftConversationDeps): void => {
  const { dir, selectedAssistantId, selectedAssistantBackend, current_model } = deps;

  const prevSignatureRef = useRef<string>('');
  const creatingRef = useRef(false);

  useEffect(() => {
    if (!selectedAssistantId) return;
    if (selectedAssistantBackend === 'aionrs') return;
    if (!current_model) return;

    const signature = `${dir}|${selectedAssistantId}|${selectedAssistantBackend}`;
    if (!dir || signature === prevSignatureRef.current) return;
    prevSignatureRef.current = signature;

    if (creatingRef.current) return;

    const createDraft = async () => {
      creatingRef.current = true;
      try {
        const prevDraft = getDraftConversation();
        if (prevDraft?.conversationId) {
          ipcBridge.conversation.remove.invoke({ id: prevDraft.conversationId }).catch(() => {});
        }

        const conversation = await ipcBridge.conversation.create.invoke({
          name: dir.split(/[\\/]/).pop() || dir,
          model: current_model,
          assistant: {
            id: selectedAssistantId,
          },
          extra: {
            workspace: dir,
            custom_workspace: true,
          },
        });

        if (!conversation?.id) return;

        setDraftConversation({
          conversationId: conversation.id,
          workspace: dir,
          assistantId: selectedAssistantId,
        });

        await warmupConversation(conversation.id).catch(() => {});
      } catch (error) {
        console.error('[useGuidDraftConversation] Failed to create draft:', error);
      } finally {
        creatingRef.current = false;
      }
    };

    void createDraft();
  }, [dir, selectedAssistantId, selectedAssistantBackend, current_model]);
};
