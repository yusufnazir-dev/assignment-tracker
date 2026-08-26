const ASSIGNMENT_KEYWORDS = [
  "assignment",
  "homework",
  "coursework",
  "deadline",
  "due date",
  "due on",
  "submission",
  "submit",
  "project",
  "lab task",
  "lab work",
  "quiz",
  "assessment",
  "exam",
];

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

export type ParsedAssignmentEmail = {
  title: string;
  course: string;
  dueDate: string;
  description: string;
  sender: string;
  keywords: string[];
};

function stripHtml(text: string) {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSubject(subject: string) {
  return subject
    .replace(/^(fw|fwd|re)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(year: number, month: number, day: number) {
  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  const yyyy = String(year);
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function extractDueDate(text: string, fallbackIso?: string) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const patterns: RegExp[] = [
    /\b(?:due|deadline|submit(?:\s+by)?|submission(?:\s+deadline)?)\s*(?:on|by|before|:)?\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/i,
    /\b(?:due|deadline|submit(?:\s+by)?|submission(?:\s+deadline)?)\s*(?:on|by|before|:)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s*,?\s*(\d{4}))?\b/i,
    /\b(?:due|deadline|submit(?:\s+by)?|submission(?:\s+deadline)?)\s*(?:on|by|before|:)?\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i,
    /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/,
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s*,?\s*(\d{4}))?\b/,
    /\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) continue;

    // Numeric date: dd/mm/yyyy or mm/dd/yyyy — prefer day-first for academic emails
    if (/^\d+$/.test(match[1] || "") && /^\d+$/.test(match[2] || "")) {
      const a = Number(match[1]);
      const b = Number(match[2]);
      let year = Number(match[3]);

      if (year < 100) year += 2000;

      // If first number > 12, it's day-first; if second > 12, month-first
      let day = a;
      let monthIndex = b - 1;

      if (a <= 12 && b > 12) {
        day = b;
        monthIndex = a - 1;
      } else if (a <= 12 && b <= 12) {
        // Ambiguous — treat as day/month (common outside US academic context)
        day = a;
        monthIndex = b - 1;
      }

      const iso = toIsoDate(year || currentYear, monthIndex, day);
      if (iso) return iso;
      continue;
    }

    // "30 August 2026" or "August 30, 2026"
    const maybeMonthFirst = MONTHS[(match[1] || "").toLowerCase()];
    const maybeMonthSecond = MONTHS[(match[2] || "").toLowerCase()];

    if (maybeMonthSecond !== undefined && /^\d+$/.test(match[1] || "")) {
      const day = Number(match[1]);
      const year = match[3] ? Number(match[3]) : currentYear;
      const iso = toIsoDate(year, maybeMonthSecond, day);
      if (iso) return iso;
    }

    if (maybeMonthFirst !== undefined && /^\d+$/.test(match[2] || "")) {
      const day = Number(match[2]);
      const year = match[3] ? Number(match[3]) : currentYear;
      const iso = toIsoDate(year, maybeMonthFirst, day);
      if (iso) return iso;
    }
  }

  if (fallbackIso) {
    return fallbackIso.slice(0, 10);
  }

  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 7
  );

  return toIsoDate(
    tomorrow.getFullYear(),
    tomorrow.getMonth(),
    tomorrow.getDate()
  )!;
}

function extractCourse(subject: string, body: string) {
  const cleaned = cleanSubject(subject);

  // "DBMS Assignment 3 – ..."
  const prefix = cleaned.match(
    /^([A-Z]{2,}[A-Z0-9]*)\s+(?:assignment|homework|project|lab|quiz|assessment)\b/i
  );
  if (prefix?.[1]) return prefix[1].toUpperCase();

  // "Assignment 3 - DBMS" / "Assignment: Operating Systems"
  const suffix = cleaned.match(
    /(?:assignment|homework|project|lab|quiz)\s*\d*\s*[:\-–—]\s*([A-Za-z][A-Za-z0-9 &\-]{1,40})/i
  );
  if (suffix?.[1]) return suffix[1].trim();

  // Avoid matching forwarded email "Subject:" headers.
  const courseLine = body.match(
    /(?:^|\n)\s*(?:course|class)\s*[:\-–—]\s*([^\n\r,]{2,60})/i
  );
  if (courseLine?.[1]) return courseLine[1].trim();

  return "Gmail";
}

function extractTitle(subject: string) {
  let title = cleanSubject(subject);

  // "DBMS Assignment 3 – Submission Deadline August 30" → "Assignment 3"
  const courseAssignment = title.match(
    /^[A-Z]{2,}[A-Z0-9]*\s+((?:assignment|homework|project|lab|quiz|assessment)\s*\d*)\b/i
  );
  if (courseAssignment?.[1]) {
    title = courseAssignment[1];
  }

  title = title
    .replace(
      /\s*[\-–—|:]\s*(?:submission\s+)?(?:deadline|due(?:\s+date)?|submit).*$/i,
      ""
    )
    .replace(/\b(?:due|deadline|submit(?:\s+by)?)\b.*$/i, "")
    .replace(/\s*[\-–—|]\s*$/g, "")
    .trim();

  if (!title) {
    title = cleanSubject(subject) || "Untitled Assignment";
  }

  // Capitalize lightly
  return title.replace(/\b\w/g, (char) => char.toUpperCase());
}

function findKeywords(text: string) {
  const lower = text.toLowerCase();

  return ASSIGNMENT_KEYWORDS.filter((keyword) => lower.includes(keyword));
}

export function isAssignmentEmail(
  subject: string,
  body: string,
  sender: string
) {
  const text = `${subject} ${body} ${sender}`.toLowerCase();

  return ASSIGNMENT_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function parseAssignmentEmail(input: {
  subject: string;
  body: string;
  sender: string;
  emailDate?: string;
}): ParsedAssignmentEmail {
  const subject = input.subject || "";
  const body = stripHtml(input.body || "");
  const combined = `${subject}\n${body}`;

  return {
    title: extractTitle(subject),
    course: extractCourse(subject, body),
    dueDate: extractDueDate(combined, input.emailDate),
    description: body.slice(0, 2000) || subject,
    sender: input.sender || "",
    keywords: findKeywords(combined),
  };
}
