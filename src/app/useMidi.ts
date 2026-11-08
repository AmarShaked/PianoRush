import { useCallback, useEffect, useState } from 'react';
import type { MidiAccessStatus, MidiDeviceInfo, WebMidiManager } from '../piano-input/WebMidiManager';

export interface MidiState {
  supported: boolean;
  status: MidiAccessStatus;
  error: string | null;
  devices: MidiDeviceInfo[];
  selectedId: string | null;
  listening: boolean;
}

function snapshotOf(m: WebMidiManager): MidiState {
  return {
    supported: m.isSupported,
    status: m.accessStatus,
    error: m.lastError,
    devices: m.listDevices(),
    selectedId: m.selectedDeviceId,
    listening: m.isListening,
  };
}

/** React binding for the WebMidiManager (re-renders on access/device/selection changes). */
export function useMidi(manager: WebMidiManager, preferredDeviceId: string | null) {
  const [state, setState] = useState(() => snapshotOf(manager));
  useEffect(() => {
    setState(snapshotOf(manager));
    return manager.onChange(() => setState(snapshotOf(manager)));
  }, [manager]);

  /** Pick the remembered device, or the only device, if nothing is selected yet. */
  const autoSelect = useCallback(() => {
    if (manager.selectedDeviceId) return;
    const devices = manager.listDevices().filter((d) => d.connected);
    const preferred = devices.find((d) => d.id === preferredDeviceId);
    const pick = preferred ?? (devices.length === 1 ? devices[0] : undefined);
    if (pick) manager.selectInput(pick.id);
  }, [manager, preferredDeviceId]);

  const connect = useCallback(async () => {
    if (await manager.requestAccess()) autoSelect();
  }, [manager, autoSelect]);

  // Returning players: if MIDI permission was already granted, reconnect silently.
  useEffect(() => {
    if (!manager.isSupported || manager.accessStatus !== 'idle') return;
    let cancelled = false;
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    perms
      ?.query({ name: 'midi' as PermissionName })
      .then((p) => {
        if (!cancelled && p.state === 'granted') void connect();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [manager, connect]);

  // Hot-plug: auto-pick the preferred device when it appears.
  useEffect(() => {
    if (state.status === 'granted') autoSelect();
  }, [state.status, state.devices.length, autoSelect]);

  return { ...state, connect, select: (id: string | null) => manager.selectInput(id) };
}
