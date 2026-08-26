import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseAssignmentEmail } from "@/lib/parse-assignment-email";

export type DashboardAssignment = {
  id: string;
  title: string;
  course: string;
  due_date: string;
  status: "Not Started" | "In Progress" | "Completed";
  source: "manual" | "gmail";
  sender?: string;
  description?: string;
  created_at?: string;
  gmail_message_id?: string;
};

function mapManualStatus(
  status: string | null | undefined
): DashboardAssignment["status"] {
  if (status === "In Progress") {
    return "In Progress";
  }

  if (
    status === "Completed" ||
    status === "Submitted" ||
    status === "completed" ||
    status === "submitted"
  ) {
    return "Completed";
  }

  return "Not Started";
}

function mapGmailStatus(
  status: string | null | undefined
): DashboardAssignment["status"] {
  const normalized = (status || "").toLowerCase();

  if (
    normalized === "submitted" ||
    normalized === "completed" ||
    normalized === "done"
  ) {
    return "Completed";
  }

  if (normalized === "in progress" || normalized === "in_progress") {
    return "In Progress";
  }

  return "Not Started";
}

export async function GET() {
  try {
    const [manualResult, gmailResult, connectionResult] = await Promise.all([
      supabaseAdmin
        .from("assignments")
        .select("*")
        .order("due_date", { ascending: true }),
      supabaseAdmin
        .from("gmail_assignments")
        .select("*")
        .order("email_date", { ascending: false }),
      supabaseAdmin
        .from("gmail_connections")
        .select("email, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (manualResult.error) {
      console.error(manualResult.error);
      return NextResponse.json(
        { error: "Could not load manual assignments" },
        { status: 500 }
      );
    }

    if (gmailResult.error) {
      console.error(gmailResult.error);
      return NextResponse.json(
        { error: "Could not load Gmail assignments" },
        { status: 500 }
      );
    }

    const manual: DashboardAssignment[] = (manualResult.data || []).map(
      (row) => ({
        id: `manual-${row.id}`,
        title: row.title,
        course: row.course,
        due_date: row.due_date,
        status: mapManualStatus(row.status),
        source: "manual" as const,
        created_at: row.created_at,
      })
    );

    const gmail: DashboardAssignment[] = (gmailResult.data || []).map(
      (row) => {
        const parsed = parseAssignmentEmail({
          subject: row.title || "",
          body: row.email_body || row.snippet || "",
          sender: row.sender || "",
          emailDate: row.email_date || undefined,
        });

        return {
          id: `gmail-${row.gmail_message_id}`,
          title: parsed.title,
          course: parsed.course,
          due_date: parsed.dueDate,
          status: mapGmailStatus(row.status),
          source: "gmail" as const,
          sender: row.sender || parsed.sender,
          description: parsed.description,
          created_at: row.created_at,
          gmail_message_id: row.gmail_message_id,
        };
      }
    );

    const assignments = [...manual, ...gmail].sort((a, b) =>
      a.due_date.localeCompare(b.due_date)
    );

    return NextResponse.json({
      assignments,
      gmail: connectionResult.data
        ? {
            connected: true,
            email: connectionResult.data.email,
            lastSynced: connectionResult.data.updated_at,
          }
        : {
            connected: false,
            email: null,
            lastSynced: null,
          },
    });
  } catch (error) {
    console.error("Load assignments error:", error);

    return NextResponse.json(
      { error: "Failed to load assignments" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body as {
      id?: string;
      status?: DashboardAssignment["status"];
    };

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required" },
        { status: 400 }
      );
    }

    if (id.startsWith("manual-")) {
      const numericId = Number(id.replace("manual-", ""));

      // DB check constraint still uses "Submitted" for done work.
      const dbStatus = status === "Completed" ? "Submitted" : status;

      const { error } = await supabaseAdmin
        .from("assignments")
        .update({ status: dbStatus })
        .eq("id", numericId);

      if (error) {
        console.error(error);
        return NextResponse.json(
          { error: "Could not update assignment" },
          { status: 500 }
        );
      }
    } else if (id.startsWith("gmail-")) {
      const gmailMessageId = id.replace("gmail-", "");
      const gmailStatus =
        status === "Completed"
          ? "completed"
          : status === "In Progress"
            ? "in_progress"
            : "pending";

      const { error } = await supabaseAdmin
        .from("gmail_assignments")
        .update({ status: gmailStatus })
        .eq("gmail_message_id", gmailMessageId);

      if (error) {
        console.error(error);
        return NextResponse.json(
          { error: "Could not update Gmail assignment" },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json({ error: "Invalid assignment id" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update assignment error:", error);

    return NextResponse.json(
      { error: "Failed to update assignment" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body as { id?: string };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (id.startsWith("manual-")) {
      const numericId = Number(id.replace("manual-", ""));

      const { error } = await supabaseAdmin
        .from("assignments")
        .delete()
        .eq("id", numericId);

      if (error) {
        console.error(error);
        return NextResponse.json(
          { error: "Could not delete assignment" },
          { status: 500 }
        );
      }
    } else if (id.startsWith("gmail-")) {
      const gmailMessageId = id.replace("gmail-", "");

      const { error } = await supabaseAdmin
        .from("gmail_assignments")
        .delete()
        .eq("gmail_message_id", gmailMessageId);

      if (error) {
        console.error(error);
        return NextResponse.json(
          { error: "Could not delete Gmail assignment" },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json({ error: "Invalid assignment id" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete assignment error:", error);

    return NextResponse.json(
      { error: "Failed to delete assignment" },
      { status: 500 }
    );
  }
}
