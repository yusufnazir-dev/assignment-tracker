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
  const [formData, setFormData] = useState({
    title: "",
    course: "",
    dueDate: "",
  });

  useEffect(() => {
    loadAssignments();
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
      return "bg-green-100 text-green-700";
    }

    if (status === "In Progress") {
      return "bg-yellow-100 text-yellow-700";
    }

    return "bg-red-100 text-red-700";
  }

  function getDotColor(assignment: Assignment) {
    if (assignment.status === "Completed") {
      return "bg-green-500";
    }

    if (isOverdue(assignment)) {
      return "bg-red-500";
    }

    if (assignment.status === "In Progress") {
      return "bg-yellow-500";
    }

    return "bg-slate-400";
  }

  function getDueTextColor(assignment: Assignment) {
    if (assignment.status === "Completed" || !assignment.due_date) {
      return "text-slate-500";
    }

    if (isOverdue(assignment)) {
      return "font-medium text-red-700";
    }

    const days = getDaysUntilDue(assignment.due_date);

    if (days === 0) {
      return "font-semibold text-red-700";
    }

    if (days === 1) {
      return "font-semibold text-amber-700";
    }

    if (days !== null && days <= 2) {
      return "font-medium text-orange-600";
    }

    return "text-slate-500";
  }

  function getRowHighlight(assignment: Assignment) {
    if (assignment.status === "Completed") {
      return "hover:bg-slate-50";
    }

    if (isOverdue(assignment)) {
      return "border-l-4 border-l-red-500 bg-red-50 hover:bg-red-100/70";
    }

    const days = getDaysUntilDue(assignment.due_date);

    if (days === 0) {
      return "border-l-4 border-l-red-500 bg-red-50 hover:bg-red-100/70";
    }

    if (days === 1) {
      return "border-l-4 border-l-amber-400 bg-amber-50 hover:bg-amber-100/70";
    }

    return "hover:bg-slate-50";
  }

  function getUrgencyBadge(assignment: Assignment) {
    if (assignment.status === "Completed" || !assignment.due_date) {
      return null;
    }

    if (isOverdue(assignment)) {
      return (
        <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
          Overdue
        </span>
      );
    }

    const days = getDaysUntilDue(assignment.due_date);

    if (days === 0) {
      return (
        <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
          Due today
        </span>
      );
    }

    if (days === 1) {
      return (
        <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white">
          Due tomorrow
        </span>
      );
    }

    return null;
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">TrackMyAssignments</h1>
            <p className="text-sm text-slate-500">
              Stay ahead of every deadline
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {gmail.connected ? (
              <>
                <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                  <span className="font-medium text-green-700">Gmail</span>
                  {" · "}
                  {gmail.email}
                  <span className="text-slate-400">
                    {" · "}
                    {formatLastSynced(gmail.lastSynced)}
                  </span>
                </div>

                <button
                  onClick={syncGmail}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50"
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
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium transition hover:bg-slate-50"
              >
                <Mail size={16} />
                Connect Gmail
              </a>
            )}
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-bold">Good afternoon</h2>
            <p className="mt-1 text-slate-500">
              Manual and Gmail assignments in one place.
            </p>
          </div>

          <button
            onClick={() => {
              setError("");
              setShowForm(true);
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700"
          >
            <Plus size={18} />
            Add Assignment
          </button>
        </div>

        {notice && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {notice}
          </div>
        )}

        <section className="mb-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            icon={<Clock size={22} />}
            label="Pending"
            value={statistics.pending}
            active={listFilter === "pending"}
            onClick={() => setListFilter("pending")}
          />
          <StatCard
            icon={<CheckCircle2 size={22} />}
            label="Completed"
            value={statistics.completed}
            active={listFilter === "completed"}
            onClick={() => setListFilter("completed")}
          />
          <StatCard
            icon={<AlertCircle size={22} />}
            label="Overdue"
            value={statistics.overdue}
            danger={statistics.overdue > 0}
            active={listFilter === "overdue"}
            onClick={() => setListFilter("overdue")}
          />
          <StatCard
            icon={<Calendar size={22} />}
            label="Due This Week"
            value={statistics.dueThisWeek}
            active={listFilter === "dueThisWeek"}
            onClick={() => setListFilter("dueThisWeek")}
          />
          <StatCard
            icon={<AlertCircle size={22} />}
            label="Total"
            value={statistics.total}
            active={listFilter === "all"}
            onClick={() => setListFilter("all")}
          />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-bold">My Assignments</h3>
              <p className="text-sm text-slate-500">
                {loading
                  ? "Loading assignments..."
                  : listFilter === "overdue"
                    ? "Showing overdue assignments"
                    : listFilter === "dueThisWeek"
                      ? "Showing assignments due this week"
                      : listFilter === "completed"
                        ? "Showing completed assignments"
                        : listFilter === "all"
                          ? "Showing all assignments"
                          : "Showing pending assignments"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-lg border border-slate-200 p-1">
                <button
                  onClick={() => setListFilter("pending")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    listFilter === "pending"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => setListFilter("completed")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    listFilter === "completed"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Completed
                </button>
                <button
                  onClick={() => setListFilter("overdue")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    listFilter === "overdue"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Overdue
                </button>
                <button
                  onClick={() => setListFilter("dueThisWeek")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    listFilter === "dueThisWeek"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  This week
                </button>
                <button
                  onClick={() => setListFilter("all")}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    listFilter === "all"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Total
                </button>
              </div>

              <button
                onClick={loadAssignments}
                title="Refresh assignments"
                className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <RefreshCw size={18} />
              </button>

              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <Search size={18} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search assignments..."
                  className="w-44 bg-transparent outline-none sm:w-56"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="border-b border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-12 text-slate-500">
              <Loader2 size={24} className="animate-spin" />
              Loading assignments...
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="p-12 text-center">
              <Search size={36} className="mx-auto mb-3 text-slate-300" />
              <h4 className="font-semibold">No assignments found</h4>
              <p className="mt-1 text-sm text-slate-500">
                {listFilter === "completed"
                  ? "No completed assignments yet."
                  : listFilter === "overdue"
                    ? "No overdue assignments."
                    : listFilter === "dueThisWeek"
                      ? "Nothing due this week."
                      : listFilter === "all"
                        ? "No assignments yet."
                        : "Add an assignment or sync Gmail to get started."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
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
                      className={`h-4 w-4 shrink-0 rounded-full transition hover:scale-125 ${getDotColor(
                        assignment
                      )}`}
                    />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4
                          className={`truncate font-semibold ${
                            assignment.status === "Completed"
                              ? "text-slate-500 line-through"
                              : ""
                          }`}
                        >
                          {assignment.title}
                        </h4>
                        {getUrgencyBadge(assignment)}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
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

                  <div className="flex flex-wrap items-center gap-3 md:justify-end">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        assignment.source === "gmail"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {assignment.source === "gmail" ? "Gmail" : "Manual"}
                    </span>

                    <div
                      className={`text-sm ${getDueTextColor(assignment)}`}
                    >
                      {getDueText(assignment)}
                    </div>

                    <div className="text-xs text-slate-400">
                      {formatDate(assignment.due_date)}
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusStyle(
                        assignment.status
                      )}`}
                    >
                      {assignment.status}
                    </span>

                    <button
                      onClick={() => deleteAssignment(assignment.id)}
                      title="Delete assignment"
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="mt-4 text-center text-xs text-slate-400">
          Click the colored dot to change status: Not Started → In Progress →
          Completed. Completed items are hidden from Pending.
        </p>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Add Assignment</h2>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
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
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
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
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
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
                  className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-slate-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="rounded-lg px-4 py-2 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAssignment}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-white transition hover:bg-slate-700 disabled:opacity-50"
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
  const baseClass = danger
    ? "border-red-200 bg-red-50"
    : "border-slate-200 bg-white";

  const activeClass = active
    ? danger
      ? "ring-2 ring-red-400"
      : "ring-2 ring-slate-900"
    : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${baseClass} ${activeClass}`}
    >
      <div
        className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${
          danger ? "bg-red-100 text-red-600" : "bg-slate-100"
        }`}
      >
        {icon}
      </div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${danger ? "text-red-600" : ""}`}>
        {value}
      </p>
    </button>
  );
}
