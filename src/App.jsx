import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BatteryCharging,
  Car,
  Clock3,
  Hand,
  HeartHandshake,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

const STORAGE_KEY = "isone-ev-coordinator-v1";

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const emptyDay = () => ({ day: dayKey(), status: "slack", pressureCount: 0, offers: [] });

const makeId = () =>
  globalThis.crypto?.randomUUID?.() || `offer-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function loadDay() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved?.day === dayKey() ? { ...emptyDay(), ...saved } : emptyDay();
  } catch {
    return emptyDay();
  }
}

function timeToDate(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

const formatTime = (time) =>
  timeToDate(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Modal({ title, children, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
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

function NameField({ value, onChange, label = "Your name" }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <UserRound className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 py-3 pl-10 pr-4 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          placeholder="Name"
        />
      </div>
    </label>
  );
}

export default function App() {
  const [state, setState] = useState(loadDay);
  const [now, setNow] = useState(new Date());
  const [modal, setModal] = useState(null);
  const [name, setName] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const congested = state.status === "congested";

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () =>
      setState((current) => {
        if (current.day !== dayKey(now)) return emptyDay();
        const offers = current.offers.filter((offer) => timeToDate(offer.time) > now);
        return offers.length === current.offers.length ? current : { ...current, offers };
      }),
    [now]
  );

  const offers = useMemo(
    () => [...state.offers].sort((a, b) => a.time.localeCompare(b.time)),
    [state.offers]
  );

  const close = () => {
    setModal(null);
    setName("");
    setTime("");
    setMessage("");
  };

  function openOffer() {
    const next = new Date(Date.now() + 30 * 60 * 1000);
    if (dayKey(next) !== dayKey()) next.setTime(Date.now() + 5 * 60 * 1000);
    setTime(
      `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`
    );
    setMessage("");
    setModal({ type: "offer" });
  }

  function submitOffer() {
    const cleanName = name.trim();
    const cleanTime = time.trim();
    if (!cleanName || !cleanTime) {
      setMessage("Please enter your name and a time.");
      return;
    }
    const scheduledTime = timeToDate(cleanTime);
    if (Number.isNaN(scheduledTime.getTime()) || scheduledTime <= new Date()) {
      setMessage("Please choose a valid time later today.");
      return;
    }
    const newOffer = { id: makeId(), offeredBy: cleanName, time: cleanTime, claimedBy: "" };
    setState((current) => ({ ...current, offers: [...current.offers, newOffer] }));
    close();
  }

  function openDetails(offer) {
    setName(offer.claimedBy || "");
    setModal({ type: offer.claimedBy ? "edit" : "claim", offer });
  }

  function saveClaim() {
    if (!name.trim()) return;
    setState((current) => ({
      ...current,
      offers: current.offers.map((o) =>
        o.id === modal.offer.id ? { ...o, claimedBy: name.trim() } : o
      ),
    }));
    close();
  }

  function removeOffer(id) {
    setState((current) => ({ ...current, offers: current.offers.filter((o) => o.id !== id) }));
    close();
  }

  return (
    <div
      className={`min-h-screen transition-colors duration-700 ${
        congested
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
        <motion.section
          layout
          className={`overflow-hidden rounded-[2rem] border bg-white/85 shadow-xl backdrop-blur ${
            congested ? "border-rose-200" : "border-emerald-200"
          }`}
        >
          <div className="p-6 text-center sm:p-9">
            <motion.div
              key={state.status}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full ${
                congested ? "bg-rose-100" : "bg-emerald-100"
              }`}
            >
              <div className="relative">
                <Car className={`h-14 w-14 ${congested ? "text-rose-700" : "text-emerald-700"}`} />
                <span className="absolute -right-5 -top-5 text-4xl">{congested ? "😟" : "😌"}</span>
              </div>
            </motion.div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[.2em] text-slate-500">
              Today’s status
            </p>
            <h2
              className={`mt-1 text-4xl font-black ${
                congested ? "text-rose-700" : "text-emerald-700"
              }`}
            >
              {congested ? "Congested" : "Slack"}
            </h2>
            {congested ? (
              <div className="mt-4">
                <p className="text-slate-600">
                  Please move off a charger when practical so another driver can charge.
                </p>
                <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 ring-1 ring-rose-200">
                  <Hand className="h-4 w-4" />
                  {state.pressureCount} {state.pressureCount === 1 ? "request" : "requests"} today
                </div>
                <div className="mt-5 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setState((s) => ({ ...s, pressureCount: s.pressureCount + 1 }))}
                    className="rounded-2xl bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-700"
                  >
                    I also need a spot
                  </button>
                  <button
                    type="button"
                    onClick={() => setState((s) => ({ ...s, status: "slack" }))}
                    className="rounded-2xl border border-emerald-300 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
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
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      status: "congested",
                      pressureCount: s.pressureCount + 1,
                    }))
                  }
                  className="mt-5 rounded-2xl bg-slate-800 px-5 py-3 font-semibold text-white hover:bg-slate-900"
                >
                  I need a charging spot
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
                <h3 className="text-xl font-bold text-slate-900">Today’s handoff offers</h3>
                <p className="mt-1 text-sm text-slate-500">Click an available offer to claim it.</p>
              </div>
              <button
                type="button"
                onClick={openOffer}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-sky-700 sm:w-auto"
              >
                <Plus className="h-5 w-5" /> Submit an offer to move
              </button>
            </div>
            <div className="mt-6 space-y-3">
              <AnimatePresence initial={false}>
                {offers.length ? (
                  offers.map((offer) => (
                    <motion.button
                      type="button"
                      layout
                      key={offer.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      onClick={() => openDetails(offer)}
                      className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
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
                    key="empty"
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
          Honor-system coordination tool. Please use names only for today’s charging handoffs. Data
          in this prototype is stored only in this browser.
        </p>
      </main>

      <AnimatePresence>
        {modal?.type === "offer" && (
          <Modal title="Offer to move" onClose={close}>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submitOffer();
              }}
              className="space-y-4"
            >
              <NameField value={name} onChange={setName} />
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Time you can unplug and vacate
                </span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => {
                    setTime(e.target.value);
                    setMessage("");
                  }}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                />
              </label>
              {message && <p role="alert" className="text-sm font-medium text-rose-600">{message}</p>}
              <button
                type="button"
                onClick={submitOffer}
                className="w-full rounded-2xl bg-sky-600 px-5 py-3 font-semibold text-white hover:bg-sky-700"
              >
                Post offer
              </button>
            </form>
          </Modal>
        )}

        {(modal?.type === "claim" || modal?.type === "edit") && (
          <Modal
            title={modal.type === "claim" ? "Claim this handoff" : "Edit claimed handoff"}
            onClose={close}
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
                label={modal.type === "claim" ? "Your name" : "Claimed by"}
              />
              <button
                type="button"
                onClick={saveClaim}
                className="w-full rounded-2xl bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-700"
              >
                {modal.type === "claim" ? "Claim this spot" : "Save claim"}
              </button>
            </form>
            <div className="mt-4 border-t border-slate-200 pt-4">
              {modal.type === "edit" && (
                <button
                  type="button"
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      offers: s.offers.map((o) =>
                        o.id === modal.offer.id ? { ...o, claimedBy: "" } : o
                      ),
                    }));
                    close();
                  }}
                  className="mb-2 w-full rounded-2xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Release claim
                </button>
              )}
              <button
                type="button"
                onClick={() => removeOffer(modal.offer.id)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
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
    </div>
  );
}
