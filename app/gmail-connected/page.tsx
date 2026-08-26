"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Mail } from "lucide-react";

export default function GmailConnectedPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function autoSync() {
      setStatus("syncing");

      try {
        const response = await fetch("/api/gmail/sync");
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok) {
          setStatus("error");
          setMessage(data.error || "Could not sync Gmail.");
          return;
        }

        setStatus("done");
        setMessage(
          `Scanned ${data.scanned} emails and saved ${data.saved} assignment${
            data.saved === 1 ? "" : "s"
          }.`
        );

        window.setTimeout(() => {
          router.push("/");
        }, 1600);
      } catch {
        if (cancelled) return;
        setStatus("error");
        setMessage("Could not sync Gmail. Please try again.");
      }
    }

    autoSync();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-700">
          {status === "syncing" ? (
            <Loader2 size={28} className="animate-spin" />
          ) : (
            <CheckCircle2 size={28} />
          )}
        </div>

        <h1 className="text-2xl font-bold">
          {status === "syncing"
            ? "Syncing Gmail..."
            : status === "error"
              ? "Connected, but sync failed"
              : "Gmail connected"}
        </h1>

        <p className="mt-2 text-slate-500">
          {status === "syncing"
            ? "Scanning your inbox for assignment emails."
            : message ||
              "Your Gmail account is linked. Assignment emails will appear on the dashboard."}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="rounded-xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700"
          >
            Back to assignments
          </Link>

          {status === "error" && (
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <Mail size={18} />
              Retry sync
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
