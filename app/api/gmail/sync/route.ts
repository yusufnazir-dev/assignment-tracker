import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  isAssignmentEmail,
  parseAssignmentEmail,
} from "@/lib/parse-assignment-email";

function getHeader(
  headers: { name?: string | null; value?: string | null }[],
  name: string
) {
  return (
    headers.find(
      (header) =>
        header.name?.toLowerCase() === name.toLowerCase()
    )?.value || ""
  );
}

function getEmailBody(payload: {
  body?: { data?: string | null } | null;
  parts?: unknown[] | null;
} | null | undefined): string {
  if (!payload) return "";

  let body = "";

  if (payload.body?.data) {
    body += Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      body += getEmailBody(
        part as {
          body?: { data?: string | null } | null;
          parts?: unknown[] | null;
        }
      );
    }
  }

  return body;
}

export async function GET() {
  try {
    const { data: connection, error: connectionError } =
      await supabaseAdmin
        .from("gmail_connections")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

    if (connectionError || !connection) {
      return NextResponse.json(
        { error: "No Gmail account connected" },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: connection.access_token,
      refresh_token: connection.refresh_token,
      expiry_date: connection.expiry_date,
    });

    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });

    const response = await gmail.users.messages.list({
      userId: "me",
      q: 'newer_than:90d (assignment OR homework OR coursework OR deadline OR "due date" OR submission OR submit OR project OR quiz OR assessment OR "lab task" OR "lab work")',
      maxResults: 50,
    });

    const messages = response.data.messages || [];

    const { data: existingRows } = await supabaseAdmin
      .from("gmail_assignments")
      .select("gmail_message_id, status");

    const statusByMessageId = new Map(
      (existingRows || []).map((row) => [
        row.gmail_message_id as string,
        row.status as string,
      ])
    );

    let savedCount = 0;
    let skippedCount = 0;

    for (const message of messages) {
      if (!message.id) continue;

      const email = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "full",
      });

      const headers = email.data.payload?.headers || [];
      const subject = getHeader(headers, "Subject");
      const sender = getHeader(headers, "From");
      const dateHeader = getHeader(headers, "Date");
      const body = getEmailBody(email.data.payload);

      if (!isAssignmentEmail(subject, body, sender)) {
        skippedCount += 1;
        continue;
      }

      const emailDate = dateHeader
        ? new Date(dateHeader).toISOString()
        : new Date().toISOString();

      const parsed = parseAssignmentEmail({
        subject,
        body,
        sender,
        emailDate,
      });

      // Keep user-set status (e.g. completed) on re-sync.
      const status = statusByMessageId.get(message.id) ?? "pending";

      // Keep the original subject in `title` so we can re-parse course,
      // assignment name, and due date from subject + body on every load.
      // Never store the email sent date as the assignment due date.
      const { error } = await supabaseAdmin.from("gmail_assignments").upsert(
        {
          gmail_message_id: message.id,
          thread_id: email.data.threadId,
          title: subject || parsed.title,
          sender,
          email_date: emailDate,
          snippet: email.data.snippet || parsed.description.slice(0, 200),
          email_body: body.slice(0, 10000),
          status,
        },
        {
          onConflict: "gmail_message_id",
        }
      );

      if (!error) {
        savedCount += 1;
      }
    }

    await supabaseAdmin
      .from("gmail_connections")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", connection.id);

    return NextResponse.json({
      success: true,
      scanned: messages.length,
      saved: savedCount,
      skipped: skippedCount,
      email: connection.email,
    });
  } catch (error) {
    console.error("Gmail sync error:", error);

    return NextResponse.json(
      { error: "Failed to sync Gmail" },
      { status: 500 }
    );
  }
}
