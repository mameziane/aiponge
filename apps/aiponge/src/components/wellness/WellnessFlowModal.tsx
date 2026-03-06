/**
 * WellnessFlowModal — Full-screen modal rendering sub-components by state machine state.
 * Orchestrates: CAPTURE → PLANNING → REVIEW → GENERATING → PREVIEW → CONFIRMED
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../theme';
import { apiRequest } from '../../lib/axiosApiClient';
import {
  useSpeechToText,
  useWellnessPlan,
  useWellnessGenerate,
  useWellnessConfirm,
  useWellnessFlowStateMachine,
} from '../../hooks/wellness';
import type { WellnessPlanResponse } from '../../hooks/wellness';
import { CaptureState } from './CaptureState';
import { ReviewState } from './ReviewState';
import { GeneratingState } from './GeneratingState';
import { PreviewState } from './PreviewState';
import { ConfirmedState } from './ConfirmedState';

interface WellnessFlowModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WellnessFlowModal({ visible, onClose }: WellnessFlowModalProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const speech = useSpeechToText();
  const { state, error: flowError, dispatch, resetFlow } = useWellnessFlowStateMachine();
  const wellnessPlan = useWellnessPlan();
  const wellnessGenerate = useWellnessGenerate();
  const wellnessConfirm = useWellnessConfirm();

  const [planData, setPlanData] = useState<WellnessPlanResponse | null>(null);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);

  // Reset everything when modal closes
  useEffect(() => {
    if (!visible) {
      speech.reset();
      resetFlow();
      wellnessPlan.reset();
      wellnessGenerate.resetGeneration();
      setPlanData(null);
      setSelectedRecipientId(null);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle DONE → trigger plan
  const handleDone = useCallback(async () => {
    dispatch({ type: 'DONE' });
    try {
      const result = await wellnessPlan.planAsync({
        transcript: speech.transcript,
        recipientId: selectedRecipientId,
        sessionId: planData?.sessionId,
      });
      if (result) {
        setPlanData(result as unknown as WellnessPlanResponse);
        dispatch({ type: 'PLAN_READY' });
      } else {
        dispatch({ type: 'PLAN_ERROR' });
      }
    } catch {
      dispatch({ type: 'PLAN_ERROR' });
    }
  }, [dispatch, wellnessPlan, speech.transcript, selectedRecipientId, planData?.sessionId]);

  // Handle recipient change → re-plan
  const handleRecipientChange = useCallback(
    async (memberId: string | null) => {
      setSelectedRecipientId(memberId);
      dispatch({ type: 'REPLAN' });
      try {
        const result = await wellnessPlan.planAsync({
          transcript: speech.transcript,
          recipientId: memberId,
          sessionId: planData?.sessionId,
        });
        if (result) {
          setPlanData(result as unknown as WellnessPlanResponse);
          dispatch({ type: 'PLAN_READY' });
        } else {
          dispatch({ type: 'PLAN_ERROR' });
        }
      } catch {
        dispatch({ type: 'PLAN_ERROR' });
      }
    },
    [dispatch, wellnessPlan, speech.transcript, planData?.sessionId]
  );

  // Handle Generate → trigger preview track generation using LLM's firstTrack plan
  const handleGenerate = useCallback(() => {
    if (!planData) return;
    dispatch({ type: 'GENERATE' });

    const plan = planData.plan;
    // Use LLM's firstTrack if available; fall back to album-level metadata
    const firstTrack = plan.firstTrack
      ? {
          prompt: plan.firstTrack.prompt,
          mood: plan.firstTrack.mood,
          genre: plan.firstTrack.genre,
          style: plan.firstTrack.style,
        }
      : {
          prompt: `${plan.album.mood} ${plan.album.style} track`,
          mood: plan.album.mood,
          genre: plan.album.genres[0] || 'ambient',
          style: plan.album.style,
        };

    wellnessGenerate.generate({
      sessionId: planData.sessionId,
      firstTrack,
    });
  }, [planData, dispatch, wellnessGenerate]);

  // Watch for generate completion
  useEffect(() => {
    if (state === 'GENERATING' && wellnessGenerate.previewTrack) {
      dispatch({ type: 'PREVIEW_READY' });
    }
    if (state === 'GENERATING' && wellnessGenerate.error) {
      dispatch({ type: 'GENERATE_ERROR' });
    }
  }, [state, wellnessGenerate.previewTrack, wellnessGenerate.error, dispatch]);

  // Handle Confirm
  const handleConfirm = useCallback(async () => {
    if (!planData || !wellnessGenerate.previewTrack) return;
    dispatch({ type: 'CONFIRM' });
    try {
      await wellnessConfirm.confirmAsync({
        sessionId: planData.sessionId,
        previewTrackId: wellnessGenerate.previewTrack.id,
      });
    } catch {
      // Still show confirmed state — the backend event will handle the rest
    }
  }, [planData, wellnessGenerate.previewTrack, dispatch, wellnessConfirm]);

  // Handle Regenerate — re-use LLM firstTrack with "(regenerated)" hint
  const handleRegenerate = useCallback(() => {
    if (!planData) return;
    dispatch({ type: 'REGENERATE' });
    wellnessGenerate.resetGeneration();
    const plan = planData.plan;
    const baseFirstTrack = plan.firstTrack
      ? {
          prompt: `${plan.firstTrack.prompt} (regenerated)`,
          mood: plan.firstTrack.mood,
          genre: plan.firstTrack.genre,
          style: plan.firstTrack.style,
        }
      : {
          prompt: `${plan.album.mood} ${plan.album.style} track (regenerated)`,
          mood: plan.album.mood,
          genre: plan.album.genres[0] || 'ambient',
          style: plan.album.style,
        };
    wellnessGenerate.generate({
      sessionId: planData.sessionId,
      firstTrack: baseFirstTrack,
    });
  }, [planData, dispatch, wellnessGenerate]);

  const handleClose = useCallback(() => {
    // Fire-and-forget cancel if we have a session in a cancelable state
    if (planData?.sessionId && (state === 'REVIEW' || state === 'CAPTURE' || state === 'PLANNING')) {
      apiRequest(`/api/v1/app/wellness/session/${planData.sessionId}`, { method: 'DELETE' }).catch(() => {
        // Best-effort — ignore errors
      });
    }
    onClose();
  }, [onClose, planData?.sessionId, state]);

  // recipientIsSelf: null/undefined means "self", or the recipient relationship is "self"
  const recipientIsSelf = !selectedRecipientId || planData?.recipient?.relationship === 'self';
  const recipientName = planData?.recipient?.name || 'them';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background.primary,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {/* Error Banner */}
        {flowError && (
          <View style={{ backgroundColor: '#FF444420', padding: 12 }}>
            <Text style={{ color: '#FF4444', fontSize: 13, textAlign: 'center' }}>{flowError}</Text>
          </View>
        )}

        {/* State-based rendering */}
        {state === 'CAPTURE' && <CaptureState speech={speech} onDone={handleDone} onCancel={handleClose} />}

        {state === 'PLANNING' && (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.brand.primary} />
            <Text style={{ fontSize: 16, color: colors.text.secondary, marginTop: 12 }}>
              Understanding your needs...
            </Text>
          </View>
        )}

        {state === 'REVIEW' && planData && (
          <ReviewState
            planData={planData}
            selectedRecipientId={selectedRecipientId}
            onRecipientChange={handleRecipientChange}
            onGenerate={handleGenerate}
            onBack={() => dispatch({ type: 'BACK' })}
          />
        )}

        {state === 'GENERATING' && (
          <GeneratingState progress={wellnessGenerate.progress} phase={wellnessGenerate.phase} />
        )}

        {state === 'PREVIEW' && wellnessGenerate.previewTrack && (
          <PreviewState
            previewTrack={wellnessGenerate.previewTrack}
            recipientName={recipientName}
            recipientIsSelf={recipientIsSelf}
            onConfirm={handleConfirm}
            onRegenerate={handleRegenerate}
            onBack={() => dispatch({ type: 'BACK' })}
            isConfirming={wellnessConfirm.isPending}
          />
        )}

        {state === 'CONFIRMED' && (
          <ConfirmedState recipientIsSelf={recipientIsSelf} recipientName={recipientName} onAutoClose={handleClose} />
        )}
      </View>
    </Modal>
  );
}
