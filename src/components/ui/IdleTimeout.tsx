// src/components/ui/IdleTimeout.tsx
// Client-side idle timeout component — monitors user activity and shows a
// warning modal before automatically logging out inactive users.
//
// HOW IT WORKS:
// 1. On mount, checks if the user is logged in by reading the data-authed
//    attribute on the <body> element (set server-side by layout.tsx).
//    If not authed — renders nothing. User is not logged in.
// 2. Starts an idle timer (2 minutes for testing — production will be 28 min).
// 3. Listens for activity events (mouse, keyboard, touch, scroll) and resets
//    the timer on each event.
// 4. When the timer expires — shows a warning modal with a countdown (30 sec
//    for testing — production will be 120 sec).
// 5. If the user clicks "Stay logged in" — resets everything.
// 6. If the countdown reaches 0 or user clicks "Log out now" — navigates to
//    /logout to clear the session.
//
// CROSS-TAB SYNC:
// Uses BroadcastChannel to sync activity across browser tabs. When any tab
// detects user activity, it broadcasts a reset message so other tabs don't
// show the warning while the user is active elsewhere. When any tab triggers
// logout, all tabs navigate to /logout together.

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// --- Configuration ---
// For testing: short timers. For production, change these:
//   IDLE_TIMEOUT_MS = 28 * 60 * 1000  (28 minutes)
//   WARNING_SECONDS = 120              (2 minutes)
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;  // 2 minutes idle before warning
const WARNING_SECONDS = 30;              // 30 second countdown in warning modal

// --- Activity events to listen for ---
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
];

// --- BroadcastChannel name ---
const CHANNEL_NAME = "qa-idle-timeout";

export function IdleTimeout() {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(WARNING_SECONDS);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref mirrors showWarning state so handleActivity can read the current value
  // without showWarning being in the useEffect dependency array (which caused
  // the modal to flicker — the effect re-ran and called resetIdleTimer).
  const showWarningRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Navigate to /logout — ends the session.
  const doLogout = useCallback((reason?: string) => {
    // Broadcast logout to all other tabs before navigating.
    try {
      channelRef.current?.postMessage({ type: "logout" });
    } catch {
      // Channel may be closed — that's fine.
    }
    window.location.href = `/logout?reason=${reason || "logout"}`;
  }, []);

  // Clear all timers.
  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // Start (or restart) the idle timer.
  const resetIdleTimer = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    showWarningRef.current = false;
    setCountdown(WARNING_SECONDS);

    idleTimerRef.current = setTimeout(() => {
      // Idle timeout expired — show the warning modal.
      setShowWarning(true);
      showWarningRef.current = true;
      setCountdown(WARNING_SECONDS);

      // Start the countdown.
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Countdown reached 0 — log out.
            clearTimers();
            doLogout("idle_timeout");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, IDLE_TIMEOUT_MS);
  }, [clearTimers, doLogout]);

  // "Stay logged in" button — resets the idle timer and closes the modal.
  // Also broadcasts activity so other tabs reset too.
  const handleStayLoggedIn = useCallback(() => {
    resetIdleTimer();
    try {
      channelRef.current?.postMessage({ type: "activity" });
    } catch {
      // Channel may be closed — that's fine.
    }
  }, [resetIdleTimer]);

  // Check for auth state on mount via data-authed body attribute.
  useEffect(() => {
    const isAuthed = document.body.getAttribute("data-authed") === "true";
    if (!isAuthed) return;
    setIsLoggedIn(true);
  }, []);

  // Set up activity listeners, idle timer, and cross-tab sync when logged in.
  useEffect(() => {
    if (!isLoggedIn) return;

    // Start the idle timer.
    resetIdleTimer();

    // --- BroadcastChannel for cross-tab sync ---
    // When any tab detects activity, it broadcasts to all other tabs so they
    // reset their idle timers too. This prevents Tab B from logging out while
    // the user is actively working in Tab A.
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;

      channel.onmessage = (event) => {
        const { type } = event.data || {};
        if (type === "activity") {
          // Another tab detected activity — reset our timer.
          resetIdleTimer();
        } else if (type === "logout") {
          // Another tab triggered logout — navigate to /logout.
          clearTimers();
          window.location.href = "/logout?reason=idle_timeout";
        }
      };
    } catch {
      // BroadcastChannel not supported (e.g. very old browsers) — fall back
      // to per-tab behavior. Not ideal, but the app still works.
    }

    // Listen for activity events.
    const handleActivity = () => {
      // Only reset if the warning modal is NOT showing.
      // Once the warning is up, only the "Stay logged in" button resets.
      // Read from the ref (not state) to avoid showWarning in the dep array.
      if (!showWarningRef.current) {
        resetIdleTimer();

        // Broadcast activity to other tabs so they reset too.
        try {
          channelRef.current?.postMessage({ type: "activity" });
        } catch {
          // Channel may be closed — that's fine.
        }
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      clearTimers();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      // Close the BroadcastChannel on cleanup.
      try {
        channel?.close();
        channelRef.current = null;
      } catch {
        // Already closed — that's fine.
      }
    };
  }, [isLoggedIn, resetIdleTimer, clearTimers]);

  // Don't render anything if not logged in or warning not showing.
  if (!isLoggedIn || !showWarning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Still there?</h2>
        <p className="text-sm text-gray-600 mb-5">
          You&apos;ve been inactive. You&apos;ll be logged out in{" "}
          <span className="font-semibold text-gray-900">{countdown}</span>{" "}
          {countdown === 1 ? "second" : "seconds"}.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleStayLoggedIn}
            className="flex-1 py-2 bg-teal-700 text-white font-semibold rounded-lg hover:bg-teal-800 transition-colors text-sm"
          >
            Stay logged in
          </button>
          <button
            onClick={() => doLogout("idle_timeout")}
            className="flex-1 py-2 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            Log out now
          </button>
        </div>
      </div>
    </div>
  );
}
