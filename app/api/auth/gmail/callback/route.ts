import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code missing" },
        { status: 400 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);

    // Use Gmail profile — works with gmail.readonly.
    // oauth2.userinfo requires a separate userinfo.email scope.
    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client,
    });

    const profile = await gmail.users.getProfile({
      userId: "me",
    });

    const email = profile.data.emailAddress;

    if (!email) {
      return NextResponse.json(
        { error: "Could not get Gmail address" },
        { status: 400 }
      );
    }

    if (!tokens.refresh_token) {
      return NextResponse.json(
        {
          error:
            "No refresh token received. Disconnect the app from your Google account and reconnect.",
        },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("gmail_connections")
      .upsert(
        {
          email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "email",
        }
      );

    if (error) {
      console.error("Supabase error:", error);

      return NextResponse.json(
        { error: "Failed to save Gmail connection" },
        { status: 500 }
      );
    }

    return NextResponse.redirect(
      new URL("/gmail-connected", request.url)
    );
  } catch (error) {
    console.error("Gmail callback error:", error);

    return NextResponse.json(
      { error: "Failed to connect Gmail" },
      { status: 500 }
    );
  }
}
