// Live timer for an in-progress painting. Polls active session on mount,
// ticks every second while running. Calls onChange after start/stop so the
// parent can refresh the painting's cached hoursWorked.

import { Ionicons } from "@expo/vector-icons";
import {
  Box,
  HStack,
  Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { useEffect, useRef, useState } from "react";

import {
  endSession,
  getActiveSession,
  startSession,
} from "@/src/repo/sessions";
import * as haptics from "@/src/lib/haptics";
import { palette } from "@/src/theme/colors";
import type { Session } from "@/src/types/session";

interface Props {
  paintingId: string;
  onChange?: () => void;
}

export function SessionTimer({ paintingId, onChange }: Props) {
  const [active, setActive] = useState<Session | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getActiveSession(paintingId).then((s) => {
      if (cancelled) return;
      setActive(s);
      if (s) setElapsed(secondsSince(s.startedAt));
    });
    return () => {
      cancelled = true;
    };
  }, [paintingId]);

  useEffect(() => {
    if (!active) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = setInterval(() => {
      setElapsed(secondsSince(active.startedAt));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [active]);

  const start = async () => {
    if (busy) return;
    haptics.medium();
    setBusy(true);
    try {
      const s = await startSession(paintingId);
      setActive(s);
      setElapsed(0);
      onChange?.();
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (busy || !active) return;
    haptics.success();
    setBusy(true);
    try {
      await endSession(active.id);
      setActive(null);
      setElapsed(0);
      onChange?.();
    } finally {
      setBusy(false);
    }
  };

  const running = !!active;

  return (
    <Box
      bg={palette.surface}
      borderRadius="$lg"
      borderWidth={1}
      borderColor={running ? palette.teal : palette.border}
      p="$4"
    >
      <HStack alignItems="center" justifyContent="space-between">
        <VStack space="xs">
          <Text size="xs" color={palette.textSubtle} style={{ letterSpacing: 1 }}>
            {running ? "TIMING" : "TIMER"}
          </Text>
          <Text
            color={running ? palette.teal : palette.text}
            size="3xl"
            fontWeight="$bold"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {formatElapsed(elapsed)}
          </Text>
        </VStack>
        <Pressable
          onPress={running ? stop : start}
          disabled={busy}
          opacity={busy ? 0.5 : 1}
          bg={running ? palette.danger : palette.teal}
          px="$5"
          py="$3"
          borderRadius="$full"
        >
          <HStack space="xs" alignItems="center">
            <Ionicons
              name={running ? "stop" : "play"}
              size={18}
              color={palette.bg}
            />
            <Text color={palette.bg} fontWeight="$bold">
              {running ? "Stop" : "Start"}
            </Text>
          </HStack>
        </Pressable>
      </HStack>
    </Box>
  );
}

function secondsSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
}

function formatElapsed(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
