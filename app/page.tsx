"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Plus,
  Mail,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Search,
  Trash2,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../lib/supabase";

type Status = "Not Started" | "In Progress" | "Completed";
type Source = "manual" | "gmail";
type ListFilter =
  | "pending"
  | "completed"
  | "overdue"
  | "dueThisWeek"
  | "all";

type Assignment = {
  id: string;
  title: string;
  course: string;
  due_date: string;
  status: Status;
  source: Source;
  sender?: string;
  description?: string;
  created_at?: string;
};

type GmailConnection = {
  connected: boolean;
  email: string | null;
  lastSynced: string | null;
};

function getDateFromString(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function formatDate(date: string) {
  if (!date) return "No due date";

  const [year, month, day] = date.split("-");

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

function getStartOfToday() {
  const today = new Date();

  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
}

function getDaysUntilDue(dueDate: string) {
  if (!dueDate) return null;

  const today = getStartOfToday();
  const due = getDateFromString(dueDate);
  const difference = due.getTime() - today.getTime();

  return Math.round(difference / (1000 * 60 * 60 * 24));
}

function getDueText(assignment: Assignment) {
  if (!assignment.due_date) {
    return "No due date found";
  }

  const formattedDate = formatDate(assignment.due_date);

  if (assignment.status === "Completed") {
    return `Due ${formattedDate}`;
  }

  const days = getDaysUntilDue(assignment.due_date);

  if (days === null) {
    return "No due date found";
  }

  if (days < 0) {
    const overdueDays = Math.abs(days);

    return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
  }

  if (days === 0) {
    return "Due today";
  }

  if (days === 1) {
    return "Due tomorrow";
  }

  return `Due in ${days} days`;
}

function isOverdue(assignment: Assignment) {
  if (assignment.status === "Completed" || !assignment.due_date) {
    return false;
  }

  const days = getDaysUntilDue(assignment.due_date);
  return days !== null && days < 0;
}

function isDueThisWeek(assignment: Assignment) {
  if (assignment.status === "Completed" || !assignment.due_date) {
    return false;
  }

  const days = getDaysUntilDue(assignment.due_date);

  return days !== null && days >= 0 && days <= 7;
}

function formatLastSynced(value: string | null) {
  if (!value) return "Never";

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  return formatDate(value.slice(0, 10));
}

function getGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function formatDateTime(date: Date) {
  return date.toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function Home() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [gmail, setGmail] = useState<GmailConnection>({
    connected: false,
    email: null,
    lastSynced: null,
  });
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [formData, setFormData] = useState({
    title: "",
    course: "",
    dueDate: "",
  });

  useEffect(() => {
    loadAssignments();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  async function loadAssignments() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/assignments");
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Could not load assignments.");
        setAssignments([]);
      } else {
        setAssignments(data.assignments as Assignment[]);
        setGmail(data.gmail as GmailConnection);
      }
    } catch (loadError) {
      console.error(loadError);
      setError("Could not load assignments.");
    }

    setLoading(false);
  }

  async function syncGmail() {
    setSyncing(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/gmail/sync");
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Could not sync Gmail.");
      } else {
        setNotice(
          `Synced Gmail: scanned ${data.scanned}, saved ${data.saved} assignment${
            data.saved === 1 ? "" : "s"
          }.`
        );
        await loadAssignments();
      }
    } catch (syncError) {
      console.error(syncError);
      setError("Could not sync Gmail. Please try again.");
    }

    setSyncing(false);
  }

  const filteredAssignments = useMemo(() => {
    const query = search.toLowerCase().trim();

    return assignments.filter((assignment) => {
      const isCompleted = assignment.status === "Completed";

      if (listFilter === "pending" && isCompleted) {
        return false;
      }

      if (listFilter === "completed" && !isCompleted) {
        return false;
      }

      if (listFilter === "overdue" && !isOverdue(assignment)) {
        return false;
      }

      if (listFilter === "dueThisWeek" && !isDueThisWeek(assignment)) {
        return false;
      }

      // "all" shows everything

      if (!query) {
        return true;
      }

      return (
        assignment.title.toLowerCase().includes(query) ||
        assignment.course.toLowerCase().includes(query) ||
        assignment.status.toLowerCase().includes(query) ||
        assignment.source.toLowerCase().includes(query) ||
        (assignment.description || "").toLowerCase().includes(query) ||
        (assignment.sender || "").toLowerCase().includes(query)
      );
    });
  }, [assignments, search, listFilter]);

  const statistics = useMemo(() => {
    const pending = assignments.filter(
      (assignment) => assignment.status !== "Completed"
    ).length;

    const completed = assignments.filter(
      (assignment) => assignment.status === "Completed"
    ).length;

    const overdue = assignments.filter(isOverdue).length;
    const dueThisWeek = assignments.filter(isDueThisWeek).length;

    return {
      pending,
      completed,
      overdue,
      dueThisWeek,
      total: assignments.length,
    };
  }, [assignments]);

  async function handleAddAssignment() {
    if (
      !formData.title.trim() ||
      !formData.course.trim() ||
      !formData.dueDate
    ) {
      alert("Please fill in all fields.");
      return;
    }

    setSaving(true);

    const { error: insertError } = await supabase.from("assignments").insert([
      {
        title: formData.title.trim(),
        course: formData.course.trim(),
        due_date: formData.dueDate,
        status: "Not Started",
      },
    ]);

    setSaving(false);

    if (insertError) {
      console.error(insertError);
      alert("Could not add assignment. Check the browser console.");
      return;
    }

    setFormData({
      title: "",
      course: "",
      dueDate: "",
    });
    setShowForm(false);
    setNotice("Assignment added.");
    await loadAssignments();
  }

  async function updateStatus(id: string, currentStatus: Status) {
    const nextStatus: Record<Status, Status> = {
      "Not Started": "In Progress",
      "In Progress": "Completed",
      Completed: "Not Started",
    };

    const newStatus = nextStatus[currentStatus];

    const response = await fetch("/api/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });

    if (!response.ok) {
      alert("Could not update assignment.");
      return;
    }

    setAssignments((currentAssignments) =>
      currentAssignments.map((assignment) =>
        assignment.id === id
          ? { ...assignment, status: newStatus }
          : assignment
      )
    );
  }

  async function deleteAssignment(id: string) {
    const assignment = assignments.find((item) => item.id === id);

    if (!assignment) {
      return;
    }

    const confirmed = window.confirm(`Delete "${assignment.title}"?`);

    if (!confirmed) {
      return;
    }

    const response = await fetch("/api/assignments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      alert("Could not delete assignment.");
      return;
    }

    setAssignments((currentAssignments) =>
      currentAssignments.filter((item) => item.id !== id)
    );
  }

  function getStatusStyle(status: Status) {
    if (status === "Completed") {
      return "bg-lime-200 text-ink border border-ink";
    }

    if (status === "In Progress") {
      return "bg-sky-200 text-ink border border-ink";
    }

    return "bg-rose-200 text-ink border border-ink";
  }

  function getDotColor(assignment: Assignment) {
    if (assignment.status === "Completed") {
      return "bg-lime-400 border-2 border-ink";
    }

    if (isOverdue(assignment)) {
      return "bg-[var(--signal)] border-2 border-ink";
    }

    if (assignment.status === "In Progress") {
      return "bg-sky-400 border-2 border-ink";
    }

    return "bg-zinc-300 border-2 border-ink";
  }

  function getDueTextColor(assignment: Assignment) {
    if (assignment.status === "Completed" || !assignment.due_date) {
      return "text-zinc-500";
    }

    if (isOverdue(assignment)) {
      return "font-bold text-[var(--signal)]";
    }

    const days = getDaysUntilDue(assignment.due_date);

    if (days === 0) {
      return "font-bold text-[var(--signal)]";
    }

    if (days === 1) {
      return "font-bold text-orange-600";
    }

    if (days !== null && days <= 2) {
      return "font-semibold text-orange-600";
    }

    return "text-zinc-600";
  }

  function getRowHighlight(assignment: Assignment) {
    if (assignment.status === "Completed") {
      return "hover:bg-zinc-50";
    }

    if (isOverdue(assignment)) {
      return "bg-rose-50 hover:bg-rose-100/80";
    }

    const days = getDaysUntilDue(assignment.due_date);

    if (days === 0) {
      return "bg-rose-50 hover:bg-rose-100/80";
    }

    if (days === 1) {
      return "bg-amber-50 hover:bg-amber-100/70";
    }

    return "hover:bg-lime-50/60";
  }

  function getUrgencyBadge(assignment: Assignment) {
    if (assignment.status === "Completed" || !assignment.due_date) {
      return null;
    }

    if (isOverdue(assignment)) {
      return (
        <span className="border-2 border-ink bg-[var(--signal)] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
          Overdue
        </span>
      );
    }

    const days = getDaysUntilDue(assignment.due_date);

    if (days === 0) {
      return (
        <span className="border-2 border-ink bg-[var(--signal)] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
          Due today
        </span>
      );
    }

    if (days === 1) {
      return (
        <span className="border-2 border-ink bg-amber-300 px-2 py-0.5 text-[10px] font-bold tracking-wider text-ink uppercase">
          Due tomorrow
        </span>
      );
    }

    return null;
  }

  const needsReconnect =
    /oauth|disabled|expired|reconnect|invalid_grant/i.test(error);

  const filterLabel =
    listFilter === "overdue"
      ? "Overdue"
      : listFilter === "dueThisWeek"
        ? "Due this week"
        : listFilter === "completed"
          ? "Completed"
          : listFilter === "all"
            ? "All"
            : "Pending";

  const filters: { id: ListFilter; label: string }[] = [
    { id: "pending", label: "Pending" },
    { id: "completed", label: "Done" },
    { id: "overdue", label: "Late" },
    { id: "dueThisWeek", label: "Week" },
    { id: "all", label: "All" },
  ];

  const clockTime = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const clockDate = now.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const tickerItems = [
    statistics.overdue > 0
      ? `${statistics.overdue} overdue — handle these first`
      : "No overdue work — nice",
    `${statistics.pending} pending`,
    `${statistics.dueThisWeek} due this week`,
    gmail.connected
      ? `Gmail linked · ${formatLastSynced(gmail.lastSynced)}`
      : "Connect Gmail to auto-import deadlines",
    getGreeting(now),
  ];

  return (
    <main className="tma-shell text-ink">
      <div className="overflow-hidden border-b-2 border-ink bg-ink text-[var(--lime)]">
        <div className="tma-ticker py-2 text-xs font-semibold tracking-[0.14em] uppercase">
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <span key={`${item}-${index}`} className="mx-6 inline-flex items-center gap-6">
              <span>{item}</span>
              <span className="text-white/30">/</span>
            </span>
          ))}
        </div>
      </div>

      <nav className="relative z-40 border-b-2 border-ink bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="tma-rise flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center border-2 border-ink bg-[var(--lime)] tma-brand text-lg font-bold">
              T
            </div>
            <div>
              <h1 className="tma-brand text-xl font-bold sm:text-2xl">
                TrackMyAssignments
              </h1>
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                Deadline cockpit
              </p>
            </div>
          </div>

          <div className="tma-rise tma-rise-delay-1 flex flex-wrap items-center gap-2">
            {gmail.connected ? (
              <>
                <div className="tma-panel-flat max-w-full px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <span className="h-2 w-2 bg-[var(--lime)] outline outline-2 outline-ink" />
                    Gmail live
                  </span>
                  <span className="text-zinc-400"> · </span>
                  <span className="break-all text-zinc-600">{gmail.email}</span>
                </div>

                <button
                  onClick={syncGmail}
                  disabled={syncing}
                  className="tma-btn inline-flex items-center gap-2 bg-[var(--lime)] px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                  {syncing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {syncing ? "Syncing..." : "Sync"}
                </button>
              </>
            ) : (
              <a
                href="/api/auth/gmail"
                className="tma-btn inline-flex items-center gap-2 bg-[var(--lime)] px-4 py-2 text-sm font-bold"
              >
                <Mail size={16} />
                Connect Gmail
              </a>
            )}
          </div>
        </div>
      </nav>

      <div className="relative mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div
          aria-hidden
          className="tma-watermark absolute top-4 right-0 hidden text-[min(28vw,220px)] text-ink/[0.04] select-none lg:block"
        >
          DUE
        </div>

        <div className="tma-rise tma-rise-delay-1 mb-10 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 border-2 border-ink bg-white px-3 py-1 text-xs font-bold tracking-[0.16em] uppercase">
              <span className="h-2 w-2 animate-[tma-blink_1.2s_steps(1)_infinite] bg-[var(--signal)]" />
              Live session
            </p>
            <h2 className="tma-brand whitespace-pre-line text-5xl leading-[0.95] font-bold sm:text-6xl lg:text-7xl">
              {getGreeting(now).replace(" ", "\n")}
            </h2>
            <p className="mt-4 max-w-md text-base text-zinc-600">
              Your assignments, deadlines, and Gmail imports — one sharp board.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
            <div className="tma-panel flex flex-1 flex-col justify-between bg-ink p-5 text-[var(--lime)]">
              <p className="text-xs font-bold tracking-[0.2em] text-white/50 uppercase">
                Local time
              </p>
              <p className="tma-mono mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {clockTime}
              </p>
              <p className="tma-mono mt-2 text-sm text-white/55">{clockDate}</p>
            </div>

            <button
              onClick={() => {
                setError("");
                setShowForm(true);
              }}
              className="tma-btn flex flex-1 items-center justify-center gap-2 bg-[var(--lime)] px-5 py-4 text-base font-bold"
            >
              <Plus size={20} />
              Add Assignment
            </button>
          </div>
        </div>

        {notice && (
          <div className="tma-rise mb-6 border-2 border-ink bg-lime-100 px-4 py-3 text-sm font-medium">
            {notice}
          </div>
        )}

        {error && (
          <div className="tma-rise mb-6 border-2 border-ink bg-rose-100 px-5 py-4">
            <p className="text-sm font-semibold text-ink">{error}</p>
            {needsReconnect && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="/api/auth/gmail"
                  className="tma-btn inline-flex items-center gap-2 bg-ink px-4 py-2 text-sm font-bold text-[var(--lime)]"
                >
                  <Mail size={16} />
                  Reconnect Gmail
                </a>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="tma-btn inline-flex items-center gap-2 bg-white px-4 py-2 text-sm font-bold"
                >
                  Open Google Cloud
                </a>
              </div>
            )}
          </div>
        )}

        <section className="tma-rise tma-rise-delay-2 mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard
            icon={<Clock size={18} />}
            label="Pending"
            value={statistics.pending}
            active={listFilter === "pending"}
            onClick={() => setListFilter("pending")}
            wide
            accent="lime"
          />
          <StatCard
            icon={<AlertCircle size={18} />}
            label="Overdue"
            value={statistics.overdue}
            danger={statistics.overdue > 0}
            active={listFilter === "overdue"}
            onClick={() => setListFilter("overdue")}
            accent="signal"
          />
          <StatCard
            icon={<CheckCircle2 size={18} />}
            label="Completed"
            value={statistics.completed}
            active={listFilter === "completed"}
            onClick={() => setListFilter("completed")}
            accent="sky"
          />
          <StatCard
            icon={<Calendar size={18} />}
            label="This week"
            value={statistics.dueThisWeek}
            active={listFilter === "dueThisWeek"}
            onClick={() => setListFilter("dueThisWeek")}
            accent="amber"
          />
          <StatCard
            icon={<AlertCircle size={18} />}
            label="Total"
            value={statistics.total}
            active={listFilter === "all"}
            onClick={() => setListFilter("all")}
            accent="zinc"
          />
        </section>

        <section className="tma-rise tma-rise-delay-3 tma-panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b-2 border-ink bg-[var(--lime)]/40 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h3 className="tma-brand text-2xl font-bold sm:text-3xl">
                My Assignments
              </h3>
              <p className="mt-1 text-sm font-medium text-zinc-600">
                {loading ? "Loading…" : `Filter · ${filterLabel}`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex flex-wrap border-2 border-ink bg-white p-1">
                {filters.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setListFilter(filter.id)}
                    className={`px-3 py-1.5 text-sm font-bold transition ${
                      listFilter === filter.id
                        ? "bg-ink text-[var(--lime)]"
                        : "text-ink hover:bg-zinc-100"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <button
                onClick={loadAssignments}
                title="Refresh assignments"
                className="tma-btn bg-white p-2"
              >
                <RefreshCw size={18} />
              </button>

              <div className="flex items-center gap-2 border-2 border-ink bg-white px-3 py-2">
                <Search size={18} className="text-zinc-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search…"
                  className="w-32 bg-transparent text-sm outline-none placeholder:text-zinc-400 sm:w-44"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-zinc-400 hover:text-ink"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-16 text-zinc-500">
              <Loader2 size={24} className="animate-spin" />
              Loading assignments…
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="relative overflow-hidden px-6 py-20 text-center">
              <div
                aria-hidden
                className="tma-watermark absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[120px] text-ink/[0.04] sm:text-[160px]"
              >
                00
              </div>
              <div className="relative">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border-2 border-ink bg-[var(--lime)]">
                  <Search size={26} />
                </div>
                <h4 className="tma-brand text-2xl font-bold">Empty board</h4>
                <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">
                  {needsReconnect
                    ? "Fix Gmail above, then sync again."
                    : listFilter === "completed"
                      ? "No completed assignments yet."
                      : listFilter === "overdue"
                        ? "Nothing overdue. Clean."
                        : listFilter === "dueThisWeek"
                          ? "Clear week ahead."
                          : "Add one manually or sync Gmail."}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y-2 divide-ink">
              {filteredAssignments.map((assignment, index) => (
                <div
                  key={assignment.id}
                  className={`flex flex-col gap-4 p-5 transition md:flex-row md:items-center md:justify-between ${getRowHighlight(
                    assignment
                  )}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="tma-mono hidden w-6 text-xs text-zinc-400 sm:block">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <button
                      onClick={() =>
                        updateStatus(assignment.id, assignment.status)
                      }
                      title="Click to change status"
                      className={`h-4 w-4 shrink-0 transition hover:scale-110 ${getDotColor(
                        assignment
                      )}`}
                    />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4
                          className={`truncate text-base font-bold ${
                            assignment.status === "Completed"
                              ? "text-zinc-400 line-through"
                              : ""
                          }`}
                        >
                          {assignment.title}
                        </h4>
                        {getUrgencyBadge(assignment)}
                      </div>
                      <p className="mt-1 truncate text-sm text-zinc-500">
                        {(() => {
                          const titleHasCourse = assignment.title
                            .toLowerCase()
                            .includes(assignment.course.toLowerCase());

                          if (titleHasCourse) {
                            return assignment.sender || null;
                          }

                          return assignment.sender
                            ? `${assignment.course} · ${assignment.sender}`
                            : assignment.course;
                        })()}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <span
                      className={`border-2 border-ink px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                        assignment.source === "gmail"
                          ? "bg-sky-200"
                          : "bg-zinc-100"
                      }`}
                    >
                      {assignment.source === "gmail" ? "Gmail" : "Manual"}
                    </span>

                    <div className={`text-sm ${getDueTextColor(assignment)}`}>
                      {getDueText(assignment)}
                    </div>

                    <div className="tma-mono text-xs text-zinc-400">
                      {formatDate(assignment.due_date)}
                    </div>

                    <span
                      className={`px-2.5 py-1 text-xs font-bold ${getStatusStyle(
                        assignment.status
                      )}`}
                    >
                      {assignment.status}
                    </span>

                    <button
                      onClick={() => deleteAssignment(assignment.id)}
                      title="Delete assignment"
                      className="border-2 border-transparent p-1.5 text-zinc-400 transition hover:border-ink hover:bg-[var(--signal)] hover:text-white"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
          <div className="tma-panel w-full max-w-md bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="tma-brand text-2xl font-bold">Add Assignment</h2>
              <button
                onClick={() => setShowForm(false)}
                className="border-2 border-ink p-1.5 hover:bg-zinc-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase">
                  Assignment Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. CPU Scheduling Assignment"
                  value={formData.title}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      title: event.target.value,
                    })
                  }
                  className="w-full border-2 border-ink bg-zinc-50 px-4 py-3 outline-none focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase">
                  Course Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Operating Systems"
                  value={formData.course}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      course: event.target.value,
                    })
                  }
                  className="w-full border-2 border-ink bg-zinc-50 px-4 py-3 outline-none focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase">
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      dueDate: event.target.value,
                    })
                  }
                  className="w-full border-2 border-ink bg-zinc-50 px-4 py-3 outline-none focus:bg-white"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="border-2 border-ink px-4 py-2 font-bold hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAssignment}
                disabled={saving}
                className="tma-btn flex items-center gap-2 bg-[var(--lime)] px-5 py-2 font-bold disabled:opacity-50"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? "Saving..." : "Add Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  danger = false,
  active = false,
  onClick,
  wide = false,
  accent = "lime",
}: {
  icon: ReactNode;
  label: string;
  value: number;
  danger?: boolean;
  active?: boolean;
  onClick?: () => void;
  wide?: boolean;
  accent?: "lime" | "signal" | "sky" | "amber" | "zinc";
}) {
  const accents: Record<string, string> = {
    lime: "bg-[var(--lime)]",
    signal: "bg-[var(--signal)] text-white",
    sky: "bg-sky-300",
    amber: "bg-amber-300",
    zinc: "bg-zinc-200",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`tma-panel group text-left transition duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_var(--ink)] ${
        wide ? "sm:col-span-2 lg:col-span-2" : "lg:col-span-1"
      } ${active ? "bg-ink text-[var(--lime)]" : "bg-white"} ${
        danger && !active ? "bg-rose-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 p-5">
        <div>
          <p
            className={`text-xs font-bold tracking-[0.16em] uppercase ${
              active ? "text-[var(--lime)]/70" : "text-zinc-500"
            }`}
          >
            {label}
          </p>
          <p className="tma-brand mt-2 text-4xl font-bold tracking-tight">
            {value}
          </p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center border-2 border-ink ${
            active ? "bg-[var(--lime)] text-ink" : accents[accent]
          }`}
        >
          {icon}
        </div>
      </div>
    </button>
  );
}
