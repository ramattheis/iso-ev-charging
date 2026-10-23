import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BatteryCharging,
  Car,
  Clock3,
  Hand,
  HeartHandshake,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  WifiOff,
  X,
} from "lucide-react";

const CLIENT_ID_KEY = "isone-ev-client-id-v1";
const POLL_INTERVAL_MS = 30_000;
const DEFAULT_LOCATION = "holyoke";
const LOCATIONS = [
  { id: "holyoke", label: "Holyoke" },
  { id: "windsor", label: "Windsor" },
];

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const emptyDay = (location = DEFAULT_LOCATION) => ({
  day: dayKey(),
  location,
  status: "slack",
  pressureCount: 0,
  offers: [],
});

function getClientId() {
  try {
    const saved = localStorage.getItem(CLIENT_ID_KEY);
    if (saved) return saved;
    const id = globalThis.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return "browser-without-storage";
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "X-EV-Client-ID": getClientId(),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;
  if (!response.ok) {
    const fallback = response.status === 429
      ? "Too many requests. Please wait a minute and try again."
      : "The shared status service is temporarily unavailable.";
    throw new Error(payload?.error || fallback);
  }
  return payload?.state;
}

const formatTime = (time) => {
  const [hours, minutes] = String(time).split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

function Modal({ title, children, onClose, busy }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={() => !busy && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function NameField({ value, onChange, label = "Your name", disabled }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <UserRound className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
        <input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          maxLength={50}
          className="w-full rounded-2xl border border-slate-200 py-3 pl-10 pr-4 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
          placeholder="Name"
        />
      </div>
    </label>
  );
}

function BusyLabel({ busy, children }) {
  return busy ? (
    <span className="inline-flex items-center justify-center gap-2">
      <LoaderCircle className="h-4 w-4 animate-spin" /> Saving…
    </span>
  ) : children;
}

export default function App() {
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [modal, setModal] = useState(null);
  const [name, setName] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const requestInFlight = useRef(false);
  const refreshController = useRef(null);
  const savingRef = useRef(false);
  const locationRef = useRef(DEFAULT_LOCATION);

  const displayState = state || emptyDay(location);
  const isLoading = state === null;
  const congested = state?.status === "congested";
  const locationLabel = LOCATIONS.find(({ id }) => id === location)?.label || "Holyoke";

  const refresh = useCallback(async ({ quiet = false, targetLocation, force = false } = {}) => {
    const requestedLocation = targetLocation || locationRef.current;
    if (savingRef.current || (requestInFlight.current && !force)) return;
    if (force) refreshController.current?.abort();
    const controller = new AbortController();
    requestInFlight.current = true;
    refreshController.current = controller;
    if (!quiet) setRefreshing(true);
    try {
      const next = await apiRequest(
        `/api/state?location=${encodeURIComponent(requestedLocation)}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted || locationRef.current !== requestedLocation) return;
      setState(next);
      setError("");
      setLastUpdated(new Date());
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message);
      }
    } finally {
      if (refreshController.current === controller) {
        refreshController.current = null;
        requestInFlight.current = false;
        if (!quiet) setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") refresh({ quiet: true });
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh({ quiet: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(intervalId);
      refreshController.current?.abort();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  const offers = useMemo(
    () => [...displayState.offers].sort((a, b) => a.time.localeCompare(b.time)),
    [displayState.offers]
  );

  function selectLocation(nextLocation) {
    if (nextLocation === locationRef.current || savingRef.current) return;
    locationRef.current = nextLocation;
    setLocation(nextLocation);
    setState(null);
    setError("");
    setLastUpdated(null);
    setModal(null);
    setConfirmation(null);
    setName("");
    setTime("");
    setMessage("");
    void refresh({ targetLocation: nextLocation, force: true });
  }

  function handleCampusKeyDown(event) {
    const currentIndex = LOCATIONS.findIndex(({ id }) => id === locationRef.current);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % LOCATIONS.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + LOCATIONS.length) % LOCATIONS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = LOCATIONS.length - 1;
    else return;

    event.preventDefault();
    const nextLocation = LOCATIONS[nextIndex].id;
    selectLocation(nextLocation);
    requestAnimationFrame(() => document.getElementById(`campus-tab-${nextLocation}`)?.focus());
  }

  const close = () => {
    if (saving) return;
    setModal(null);
    setName("");
    setTime("");
    setMessage("");
  };

  async function commitAction(action) {
    const actionLocation = locationRef.current;
    savingRef.current = true;
    refreshController.current?.abort();
    setSaving(true);
    try {
      const next = await apiRequest("/api/action", {
        method: "POST",
        body: JSON.stringify({ ...action, location: actionLocation }),
      });
      if (locationRef.current === actionLocation) {
        setState(next);
        setError("");
        setLastUpdated(new Date());
      }
      return next;
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function openOffer() {
    const next = new Date(Date.now() + 30 * 60 * 1000);
    if (dayKey(next) !== dayKey()) next.setTime(Date.now() + 5 * 60 * 1000);
    setTime(
      `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`
    );
    setMessage("");
    setModal({ type: "offer" });
  }

  async function submitOffer() {
    const cleanName = name.trim();
    const cleanTime = time.trim();
    if (!cleanName || !cleanTime) {
      setMessage("Please enter your name and a time.");
      return;
    }
    const [hours, minutes] = cleanTime.split(":").map(Number);
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);
    if (Number.isNaN(scheduledTime.getTime()) || scheduledTime <= new Date()) {
      setMessage("Please choose a valid time later today.");
      return;
    }
    try {
      await commitAction({ action: "create_offer", offeredBy: cleanName, time: cleanTime });
      close();
    } catch (requestError) {
      setMessage(requestError.message);
    }
  }

  function openDetails(offer) {
    setName(offer.claimedBy || "");
    setMessage("");
    setModal({ type: offer.claimedBy ? "edit" : "claim", offer });
  }

  async function saveClaim() {
    if (!name.trim()) {
      setMessage("Please enter your name.");
      return;
    }
    try {
      await commitAction({
        action: modal.type === "claim" ? "claim_offer" : "update_claim",
        id: modal.offer.id,
        claimedBy: name.trim(),
      });
      close();
    } catch (requestError) {
      setMessage(requestError.message);
    }
  }

  function askToSetSlack() {
    setConfirmation({
      title: "Mark conditions as slack?",
      description:
        `Continue only if there are at least a few open charging spots at ${locationLabel} right now. This changes the shared ${locationLabel} status for everyone.`,
      confirmLabel: "Yes, mark as slack",
      action: {
        action: "set_slack",
        expectedPressureCount: displayState.pressureCount,
      },
      closeDetails: false,
      error: "",
    });
  }

  function askToReleaseClaim(offer) {
    setConfirmation({
      title: "Release this claim?",
      description: `This will make ${formatTime(offer.time)} available for someone else to claim.`,
      confirmLabel: "Yes, release claim",
      action: { action: "release_claim", id: offer.id },
      closeDetails: true,
      error: "",
    });
  }

  function askToRemoveOffer(offer) {
    const claimed = Boolean(offer.claimedBy);
    setConfirmation({
      title: claimed ? "Remove this claimed offer?" : "Remove this offer?",
      description: claimed
        ? `This will remove ${offer.offeredBy}’s ${formatTime(offer.time)} offer and ${offer.claimedBy}’s claim for everyone.`
        : `This will remove ${offer.offeredBy}’s ${formatTime(offer.time)} offer for everyone.`,
      confirmLabel: claimed ? "Yes, remove claimed offer" : "Yes, remove offer",
      action: { action: "remove_offer", id: offer.id },
      closeDetails: true,
      error: "",
    });
  }

  async function confirmSensitiveAction() {
    const pending = confirmation;
    if (!pending) return;
    setConfirmation((current) => (current ? { ...current, error: "" } : current));
    try {
      await commitAction(pending.action);
      setConfirmation(null);
      if (pending.closeDetails) {
        setModal(null);
        setName("");
        setTime("");
        setMessage("");
      }
    } catch (requestError) {
      setConfirmation((current) =>
        current ? { ...current, error: requestError.message } : current
      );
      if (pending.action.action === "set_slack") {
        await refresh({ quiet: true });
      }
    }
  }

  const runMainAction = (action) => commitAction(action).catch(() => {});

  return (
    <div
      className={`min-h-screen transition-colors duration-700 ${
        isLoading
          ? "bg-gradient-to-b from-slate-50 to-white"
          : congested
          ? "bg-gradient-to-b from-rose-50 via-orange-50 to-slate-100"
          : "bg-gradient-to-b from-sky-50 via-emerald-50 to-white"
      }`}
    >
      <header className="mx-auto max-w-4xl px-5 pb-5 pt-10 text-center sm:pt-14">
        <div
          className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ${
            congested ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          <BatteryCharging className="h-8 w-8" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          EV Charging Coordinator
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
          Offer a time when you can unplug and vacate a charging space. Another driver can claim the
          handoff and meet you then. If the two drivers do not meet, the open space is first-come,
          first-served.
        </p>
        <div className="mx-auto mt-5 grid max-w-2xl gap-2 text-sm text-slate-600 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/70 px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
            <HeartHandshake className="mx-auto mb-1 h-5 w-5 text-sky-600" />
            Be thoughtful—our commute and energy needs differ.
          </div>
          <div className="rounded-2xl bg-white/70 px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
            <Clock3 className="mx-auto mb-1 h-5 w-5 text-sky-600" />
            Offers disappear automatically at their scheduled time.
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 pb-16">
        <div className="mb-4 flex min-h-10 items-center justify-center">
          {error ? (
            <div role="alert" className="flex w-full items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-white/90 px-4 py-3 text-sm text-rose-700 shadow-sm">
              <span className="flex items-center gap-2"><WifiOff className="h-4 w-4 shrink-0" /> {error}</span>
              <button
                type="button"
                onClick={() => refresh()}
                disabled={refreshing}
                className="shrink-0 rounded-xl px-3 py-1.5 font-semibold hover:bg-rose-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                <span className="sr-only">Try again</span>
              </button>
            </div>
          ) : state ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200/70">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Shared status is live{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
            </p>
          ) : (
            <p className="inline-flex items-center gap-2 text-sm text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Loading shared status…
            </p>
          )}
        </div>

        <div className="mb-3 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-slate-500">
            Campus
          </p>
          <div
            role="tablist"
            aria-label="Campus"
            className="inline-flex rounded-2xl bg-slate-200/75 p-1 shadow-inner"
          >
            {LOCATIONS.map((campus) => {
              const selected = campus.id === location;
              return (
                <button
                  type="button"
                  role="tab"
                  id={`campus-tab-${campus.id}`}
                  aria-controls="campus-status-panel"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  key={campus.id}
                  disabled={saving}
                  onClick={() => selectLocation(campus.id)}
                  onKeyDown={handleCampusKeyDown}
                  className={`min-w-32 rounded-xl px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  {campus.label}
                </button>
              );
            })}
          </div>
        </div>

        <motion.section
          layout
          id="campus-status-panel"
          role="tabpanel"
          aria-labelledby={`campus-tab-${location}`}
          aria-busy={!state || saving}
          className={`overflow-hidden rounded-[2rem] border bg-white/85 shadow-xl backdrop-blur ${
            isLoading
              ? "border-slate-200"
              : congested
                ? "border-rose-200"
                : "border-emerald-200"
          }`}
        >
          <div className="p-6 text-center sm:p-9">
            <motion.div
              key={`${location}-${isLoading ? "loading" : displayState.status}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full ${
                isLoading ? "bg-slate-100" : congested ? "bg-rose-100" : "bg-emerald-100"
              }`}
            >
              {isLoading ? (
                <LoaderCircle className="h-12 w-12 animate-spin text-slate-400" />
              ) : (
                <div className="relative">
                  <Car className={`h-14 w-14 ${congested ? "text-rose-700" : "text-emerald-700"}`} />
                  <span className="absolute -right-5 -top-5 text-4xl">{congested ? "😟" : "😌"}</span>
                </div>
              )}
            </motion.div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[.2em] text-slate-500">
              Today’s status · {locationLabel}
            </p>
            <h2
              className={`mt-1 text-4xl font-black ${
                isLoading ? "text-slate-500" : congested ? "text-rose-700" : "text-emerald-700"
              }`}
            >
              {isLoading ? "Loading…" : congested ? "Congested" : "Slack"}
            </h2>
            {isLoading ? (
              <p className="mt-4 text-slate-500">Fetching the current shared status…</p>
            ) : congested ? (
              <div className="mt-4">
                <p className="text-slate-600">
                  Please move off a charger when practical so another driver can charge.
                </p>
                <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 ring-1 ring-rose-200">
                  <Hand className="h-4 w-4" />
                  {displayState.pressureCount} {displayState.pressureCount === 1 ? "request" : "requests"} today
                </div>
                <div className="mt-5 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    disabled={!state || saving}
                    onClick={() => runMainAction({ action: "request_spot" })}
                    className="rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <BusyLabel busy={saving}>I also need a spot</BusyLabel>
                  </button>
                  <button
                    type="button"
                    disabled={!state || saving}
                    onClick={askToSetSlack}
                    className="rounded-2xl border border-emerald-300 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Actually, there are at least a few open spots...
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-slate-600">No one has signaled unmet charging demand today.</p>
                <button
                  type="button"
                  disabled={!state || saving}
                  onClick={() => runMainAction({ action: "request_spot" })}
                  className="mt-5 rounded-2xl bg-slate-800 px-5 py-3 font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BusyLabel busy={saving}>I need a charging spot</BusyLabel>
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  This changes today’s status to congested until tomorrow.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white/75 p-6 sm:p-9">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Today’s {locationLabel} handoff offers
                </h3>
                <p className="mt-1 text-sm text-slate-500">Click an available offer to claim it.</p>
              </div>
              <button
                type="button"
                onClick={openOffer}
                disabled={!state || saving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                <Plus className="h-5 w-5" /> Submit an offer to move
              </button>
            </div>
            <div className="mt-6 space-y-3">
              <AnimatePresence initial={false}>
                {isLoading ? (
                  <motion.div
                    key={`loading-offers-${location}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-sm text-slate-500"
                  >
                    <LoaderCircle className="h-4 w-4 animate-spin" /> Loading current offers…
                  </motion.div>
                ) : offers.length ? (
                  offers.map((offer) => (
                    <motion.button
                      type="button"
                      layout
                      key={offer.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      onClick={() => openDetails(offer)}
                      disabled={saving}
                      className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 ${
                        offer.claimedBy
                          ? "border-violet-200 bg-violet-50"
                          : "border-sky-200 bg-sky-50 hover:border-sky-400"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-lg font-bold text-slate-900">{formatTime(offer.time)}</p>
                        <p className="truncate text-sm text-slate-600">
                          {offer.offeredBy} will unplug and vacate
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                            offer.claimedBy
                              ? "bg-violet-200 text-violet-900"
                              : "bg-sky-600 text-white"
                          }`}
                        >
                          {offer.claimedBy ? "Claimed" : "Claim spot"}
                        </span>
                        {offer.claimedBy && (
                          <p className="mt-1 max-w-36 truncate text-xs text-violet-800">
                            by {offer.claimedBy}
                          </p>
                        )}
                      </div>
                    </motion.button>
                  ))
                ) : (
                  <motion.div
                    key={`empty-${location}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-2xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500"
                  >
                    No active handoff offers yet.
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.section>
        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          Anonymous honor-system tool. Each campus has separate entries, limited to first names and
          deleted after the day ends.{" "}
          <a
            href="/legal.html"
            className="whitespace-nowrap underline decoration-slate-300 underline-offset-2 transition hover:text-slate-700"
          >
            Legal &amp; licenses
          </a>
        </p>
      </main>

      <AnimatePresence>
        {!confirmation && modal?.type === "offer" && (
          <Modal title={`Offer to move · ${locationLabel}`} onClose={close} busy={saving}>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submitOffer();
              }}
              className="space-y-4"
            >
              <NameField value={name} onChange={setName} disabled={saving} />
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Time you can unplug and vacate
                </span>
                <input
                  type="time"
                  value={time}
                  disabled={saving}
                  onChange={(event) => {
                    setTime(event.target.value);
                    setMessage("");
                  }}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50"
                />
              </label>
              {message && <p role="alert" className="text-sm font-medium text-rose-600">{message}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-2xl bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                <BusyLabel busy={saving}>Post offer</BusyLabel>
              </button>
            </form>
          </Modal>
        )}

        {!confirmation && (modal?.type === "claim" || modal?.type === "edit") && (
          <Modal
            title={modal.type === "claim" ? "Claim this handoff" : "Edit claimed handoff"}
            onClose={close}
            busy={saving}
          >
            <div className="mb-5 rounded-2xl bg-slate-50 p-4">
              <p className="text-2xl font-bold text-slate-900">{formatTime(modal.offer.time)}</p>
              <p className="text-sm text-slate-600">Meet {modal.offer.offeredBy} at the charger.</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                If you do not meet, the vacated spot is first-come, first-served.
              </p>
            </div>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                saveClaim();
              }}
              className="space-y-4"
            >
              <NameField
                value={name}
                onChange={setName}
                disabled={saving}
                label={modal.type === "claim" ? "Your name" : "Claimed by"}
              />
              {message && <p role="alert" className="text-sm font-medium text-rose-600">{message}</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                <BusyLabel busy={saving}>
                  {modal.type === "claim" ? "Claim this spot" : "Save claim"}
                </BusyLabel>
              </button>
            </form>
            <div className="mt-4 border-t border-slate-200 pt-4">
              {modal.type === "edit" && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => askToReleaseClaim(modal.offer)}
                  className="mb-2 w-full rounded-2xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  Release claim
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => askToRemoveOffer(modal.offer)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Remove offer
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">
                Use “Remove offer” only if the offer was posted by mistake or is no longer valid.
              </p>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmation && (
          <Modal
            title={confirmation.title}
            onClose={() => setConfirmation(null)}
            busy={saving}
          >
            <div className="mb-5 flex gap-3 rounded-2xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-sm leading-6">{confirmation.description}</p>
            </div>
            {confirmation.error && (
              <p role="alert" className="mb-4 text-sm font-medium text-rose-600">
                {confirmation.error}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmation(null)}
                className="rounded-2xl px-5 py-3 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={confirmSensitiveAction}
                className="rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                <BusyLabel busy={saving}>{confirmation.confirmLabel}</BusyLabel>
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
