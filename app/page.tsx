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
      return "bg-emerald-100/90 text-emerald-800";
    }

    if (status === "In Progress") {
      return "bg-amber-100/90 text-amber-900";
    }

    return "bg-rose-100/90 text-rose-800";
  }

  function getDotColor(assignment: Assignment) {
    if (assignment.status === "Completed") {
      return "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]";
    }

    if (isOverdue(assignment)) {
      return "bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.18)]";
    }

    if (assignment.status === "In Progress") {
      return "bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.2)]";
    }

    return "bg-teal-400/80 shadow-[0_0_0_4px_rgba(45,212,191,0.15)]";
  }

  function getDueTextColor(assignment: Assignment) {
    if (assignment.status === "Completed" || !assignment.due_date) {
      return "text-teal-800/50";
    }

    if (isOverdue(assignment)) {
      return "font-medium text-rose-700";
    }

    const days = getDaysUntilDue(assignment.due_date);

    if (days === 0) {
      return "font-semibold text-rose-700";
    }

    if (days === 1) {
      return "font-semibold text-amber-700";
    }

    if (days !== null && days <= 2) {
      return "font-medium text-orange-700";
    }

    return "text-teal-800/55";
  }

  function getRowHighlight(assignment: Assignment) {
    if (assignment.status === "Completed") {
      return "hover:bg-teal-50/50";
    }

    if (isOverdue(assignment)) {
      return "border-l-[3px] border-l-rose-500 bg-rose-50/70 hover:bg-rose-50";
    }

    const days = getDaysUntilDue(assignment.due_date);

    if (days === 0) {
      return "border-l-[3px] border-l-rose-500 bg-rose-50/70 hover:bg-rose-50";
    }

    if (days === 1) {
      return "border-l-[3px] border-l-amber-400 bg-amber-50/60 hover:bg-amber-50/80";
    }

    return "hover:bg-teal-50/40";
  }

  function getUrgencyBadge(assignment: Assignment) {
    if (assignment.status === "Completed" || !assignment.due_date) {
      return null;
    }

    if (isOverdue(assignment)) {
      return (
        <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase">
          Overdue
        </span>
      );
    }

    const days = getDaysUntilDue(assignment.due_date);

    if (days === 0) {
      return (
        <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase">
          Due today
        </span>
      );
    }

    if (days === 1) {
      return (
        <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase">
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
    { id: "completed", label: "Completed" },
    { id: "overdue", label: "Overdue" },
    { id: "dueThisWeek", label: "This week" },
    { id: "all", label: "Total" },
  ];

  return (
    <main className="tma-shell text-ink">
      <nav className="tma-glass sticky top-0 z-40 border-b border-teal-900/5">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="tma-rise">
            <h1 className="tma-brand text-2xl font-bold text-teal-950">
              TrackMyAssignments
            </h1>
            <p className="mt-0.5 text-sm text-teal-800/55">
              Deadlines, sorted.
            </p>
          </div>

          <div className="tma-rise tma-rise-delay-1 flex flex-wrap items-center gap-2">
            {gmail.connected ? (
              <>
                <div className="rounded-xl border border-teal-900/10 bg-white/60 px-3 py-2 text-sm text-teal-900/70">
                  <span className="inline-flex items-center gap-1.5 font-medium text-teal-700">
                    <span className="h-1.5 w-1.5 animate-[tma-pulse-soft_2s_ease-in-out_infinite] rounded-full bg-teal-500" />
                    Gmail
                  </span>
                  <span className="text-teal-900/30"> · </span>
                  <span className="break-all">{gmail.email}</span>
                  <span className="text-teal-900/35">
                    {" · "}
                    {formatLastSynced(gmail.lastSynced)}
                  </span>
                </div>

                <button
                  onClick={syncGmail}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
                >
                  {syncing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {syncing ? "Syncing..." : "Sync Gmail"}
                </button>
              </>
            ) : (
              <a
                href="/api/auth/gmail"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-700"
              >
                <Mail size={16} />
                Connect Gmail
              </a>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="tma-rise tma-rise-delay-1 mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-teal-700/70 uppercase">
              {formatDateTime(now)}
            </p>
            <h2 className="tma-brand text-4xl font-bold tracking-tight text-teal-950 sm:text-5xl">
              {getGreeting(now)}
            </h2>
          </div>

          <button
            onClick={() => {
              setError("");
              setShowForm(true);
            }}
            className="flex items-center justify-center gap-2 rounded-2xl bg-teal-950 px-5 py-3.5 font-medium text-white transition hover:-translate-y-0.5 hover:bg-teal-800"
          >
            <Plus size={18} />
            Add Assignment
          </button>
        </div>

        {notice && (
          <div className="tma-rise mb-6 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        )}

        {error && (
          <div className="tma-rise mb-6 overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50/40 px-5 py-4">
            <p className="text-sm font-medium text-rose-800">{error}</p>
            {needsReconnect && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="/api/auth/gmail"
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-600"
                >
                  <Mail size={16} />
                  Reconnect Gmail
                </a>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white/70 px-4 py-2 text-sm font-medium text-rose-800 transition hover:bg-white"
                >
                  Open Google Cloud
                </a>
              </div>
            )}
          </div>
        )}

        <section className="tma-rise tma-rise-delay-2 mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            icon={<Clock size={20} />}
            label="Pending"
            value={statistics.pending}
            active={listFilter === "pending"}
            onClick={() => setListFilter("pending")}
          />
          <StatCard
            icon={<CheckCircle2 size={20} />}
            label="Completed"
            value={statistics.completed}
            active={listFilter === "completed"}
            onClick={() => setListFilter("completed")}
          />
          <StatCard
            icon={<AlertCircle size={20} />}
            label="Overdue"
            value={statistics.overdue}
            danger={statistics.overdue > 0}
            active={listFilter === "overdue"}
            onClick={() => setListFilter("overdue")}
          />
          <StatCard
            icon={<Calendar size={20} />}
            label="Due This Week"
            value={statistics.dueThisWeek}
            active={listFilter === "dueThisWeek"}
            onClick={() => setListFilter("dueThisWeek")}
          />
          <StatCard
            icon={<AlertCircle size={20} />}
            label="Total"
            value={statistics.total}
            active={listFilter === "all"}
            onClick={() => setListFilter("all")}
          />
        </section>

        <section className="tma-rise tma-rise-delay-3 overflow-hidden rounded-3xl tma-glass shadow-[0_20px_50px_-28px_rgba(11,31,42,0.35)]">
          <div className="flex flex-col gap-4 border-b border-teal-900/8 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="tma-brand text-2xl font-bold text-teal-950">
                My Assignments
              </h3>
              <p className="mt-1 text-sm text-teal-800/50">
                {loading ? "Loading…" : filterLabel}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex flex-wrap rounded-xl border border-teal-900/10 bg-white/50 p-1">
                {filters.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setListFilter(filter.id)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      listFilter === filter.id
                        ? "bg-teal-900 text-white"
                        : "text-teal-800/65 hover:bg-teal-900/5"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <button
                onClick={loadAssignments}
                title="Refresh assignments"
                className="rounded-xl border border-teal-900/10 bg-white/50 p-2 text-teal-800/55 transition hover:bg-white hover:text-teal-900"
              >
                <RefreshCw size={18} />
              </button>

              <div className="flex items-center gap-2 rounded-xl border border-teal-900/10 bg-white/50 px-3 py-2">
                <Search size={18} className="text-teal-800/35" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search…"
                  className="w-36 bg-transparent text-sm outline-none placeholder:text-teal-800/35 sm:w-48"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-teal-800/40 hover:text-teal-900"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-16 text-teal-800/50">
              <Loader2 size={24} className="animate-spin text-teal-700" />
              Loading assignments…
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100/80 text-teal-700">
                <Search size={28} />
              </div>
              <h4 className="tma-brand text-lg font-bold text-teal-950">
                Nothing here yet
              </h4>
              <p className="mx-auto mt-2 max-w-sm text-sm text-teal-800/55">
                {needsReconnect
                  ? "Fix Gmail connection above, then sync again."
                  : listFilter === "completed"
                    ? "No completed assignments yet."
                    : listFilter === "overdue"
                      ? "No overdue assignments."
                      : listFilter === "dueThisWeek"
                        ? "Nothing due this week."
                        : listFilter === "all"
                          ? "Add an assignment or sync Gmail."
                          : "Add an assignment or sync Gmail."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-teal-900/6">
              {filteredAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className={`flex flex-col gap-4 p-5 transition md:flex-row md:items-center md:justify-between ${getRowHighlight(
                    assignment
                  )}`}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <button
                      onClick={() =>
                        updateStatus(assignment.id, assignment.status)
                      }
                      title="Click to change status"
                      className={`h-3.5 w-3.5 shrink-0 rounded-full transition hover:scale-125 ${getDotColor(
                        assignment
                      )}`}
                    />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4
                          className={`truncate font-semibold text-teal-950 ${
                            assignment.status === "Completed"
                              ? "text-teal-800/45 line-through"
                              : ""
                          }`}
                        >
                          {assignment.title}
                        </h4>
                        {getUrgencyBadge(assignment)}
                      </div>
                      <p className="mt-1 truncate text-sm text-teal-800/50">
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

                  <div className="flex flex-wrap items-center gap-2.5 md:justify-end">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
                        assignment.source === "gmail"
                          ? "bg-sky-100 text-sky-800"
                          : "bg-teal-100 text-teal-800"
                      }`}
                    >
                      {assignment.source === "gmail" ? "Gmail" : "Manual"}
                    </span>

                    <div className={`text-sm ${getDueTextColor(assignment)}`}>
                      {getDueText(assignment)}
                    </div>

                    <div className="text-xs text-teal-800/40">
                      {formatDate(assignment.due_date)}
                    </div>

                    <span
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${getStatusStyle(
                        assignment.status
                      )}`}
                    >
                      {assignment.status}
                    </span>

                    <button
                      onClick={() => deleteAssignment(assignment.id)}
                      title="Delete assignment"
                      className="rounded-lg p-2 text-teal-800/30 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-teal-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-teal-900/10 bg-white p-6 shadow-[0_30px_80px_-20px_rgba(11,31,42,0.45)]">
            <div className="flex items-center justify-between">
              <h2 className="tma-brand text-xl font-bold text-teal-950">
                Add Assignment
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 text-teal-800/40 hover:bg-teal-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-teal-900/80">
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
                  className="w-full rounded-xl border border-teal-900/10 bg-teal-50/30 px-4 py-3 outline-none transition focus:border-teal-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-teal-900/80">
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
                  className="w-full rounded-xl border border-teal-900/10 bg-teal-50/30 px-4 py-3 outline-none transition focus:border-teal-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-teal-900/80">
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
                  className="w-full rounded-xl border border-teal-900/10 bg-teal-50/30 px-4 py-3 outline-none transition focus:border-teal-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="rounded-xl px-4 py-2 text-teal-900/70 hover:bg-teal-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAssignment}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-teal-950 px-5 py-2 text-white transition hover:bg-teal-800 disabled:opacity-50"
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
}: {
  icon: ReactNode;
  label: string;
  value: number;
  danger?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl border p-5 text-left transition duration-200 hover:-translate-y-1 ${
        danger
          ? "border-rose-200/80 bg-gradient-to-br from-rose-50 to-orange-50/40"
          : "tma-glass"
      } ${
        active
          ? danger
            ? "ring-2 ring-rose-400/70"
            : "ring-2 ring-teal-800/40"
          : ""
      }`}
    >
      <div
        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-2xl ${
          danger ? "bg-rose-100 text-rose-600" : "bg-teal-100/80 text-teal-800"
        }`}
      >
        {icon}
      </div>
      <p className="text-sm text-teal-800/55">{label}</p>
      <p
        className={`tma-brand mt-1 text-3xl font-bold tracking-tight ${
          danger ? "text-rose-600" : "text-teal-950"
        }`}
      >
        {value}
      </p>
    </button>
  );
}
