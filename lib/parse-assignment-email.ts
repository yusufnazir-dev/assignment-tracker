const ASSIGNMENT_KEYWORDS = [
  "assignment",
  "homework",
  "coursework",
  "deadline",
  "due date",
  "due on",
  "last date",
  "submission",
  "submit",
  "project",
  "lab task",
  "lab work",
  "quiz",
  "assessment",
  "exam",
  "tutorial",
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

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/** Matches Assignment / Tutorial / Homework etc., including "Assignments 1 and 2" */
const ASSIGNMENT_LABEL =
  "(?:assignments?|tutorials?|homeworks?|projects?|labs?(?:\\s+(?:task|work))?|quizzes?|assessments?|coursework|exams?)";

const DUE_LABEL =
  "(?:last\\s*date|due\\s*date|deadline|submission\\s*(?:date|deadline)|submit(?:\\s+(?:by|before|on\\s+or\\s+before))?|due(?:\\s+(?:on|by|before))?|on\\s+or\\s+before|before)";

export type ParsedAssignmentEmail = {
  title: string;
  course: string;
  /** ISO date (YYYY-MM-DD) from email content, or null if none found */
  dueDate: string | null;
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

function titleCase(text: string) {
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
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

function resolveYear(
  monthIndex: number,
  day: number,
  explicitYear: number | null,
  referenceDate?: Date
) {
  if (explicitYear) {
    return explicitYear < 100 ? explicitYear + 2000 : explicitYear;
  }

  const ref = referenceDate || new Date();
  let year = ref.getFullYear();
  const candidate = new Date(year, monthIndex, day);

  // If the date would already be well before the email was sent, assume next year.
  if (candidate.getTime() < ref.getTime() - 45 * 24 * 60 * 60 * 1000) {
    year += 1;
  }

  return year;
}

function parseNumericDateParts(
  a: number,
  b: number,
  yearRaw: number | null,
  referenceDate?: Date
) {
  let day = a;
  let monthIndex = b - 1;

  if (a <= 12 && b > 12) {
    day = b;
    monthIndex = a - 1;
  } else if (a <= 12 && b <= 12) {
    // Ambiguous — prefer day/month (common in academic emails outside the US).
    day = a;
    monthIndex = b - 1;
  }

  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) {
    return null;
  }

  const year = resolveYear(monthIndex, day, yearRaw, referenceDate);
  return toIsoDate(year, monthIndex, day);
}

function parseMonthNameDate(
  monthToken: string,
  day: number,
  yearRaw: number | null,
  referenceDate?: Date
) {
  const monthIndex = MONTHS[monthToken.toLowerCase()];
  if (monthIndex === undefined || day < 1 || day > 31) {
    return null;
  }

  const year = resolveYear(monthIndex, day, yearRaw, referenceDate);
  return toIsoDate(year, monthIndex, day);
}

/**
 * "Thursday 20th 2026" with no month — find the month where that
 * day-of-month falls on that weekday, nearest the email date.
 */
function resolveWeekdayDayYear(
  weekdayToken: string,
  day: number,
  year: number,
  referenceDate?: Date
): string | null {
  const targetDow = WEEKDAYS[weekdayToken.toLowerCase()];
  if (targetDow === undefined || day < 1 || day > 31) {
    return null;
  }

  const candidates: Date[] = [];

  for (let month = 0; month < 12; month++) {
    const date = new Date(year, month, day);
    if (date.getMonth() !== month || date.getDate() !== day) continue;
    if (date.getDay() === targetDow) {
      candidates.push(date);
    }
  }

  if (candidates.length === 0) return null;

  const ref = referenceDate || new Date(year, 0, 1);
  candidates.sort(
    (a, b) =>
      Math.abs(a.getTime() - ref.getTime()) -
      Math.abs(b.getTime() - ref.getTime())
  );

  const best = candidates[0];
  return toIsoDate(best.getFullYear(), best.getMonth(), best.getDate());
}

/**
 * Pull a calendar date from a regex match.
 */
function dateFromMatch(
  match: RegExpMatchArray,
  referenceDate?: Date
): string | null {
  const groups = match.slice(1).filter((g) => g !== undefined);

  // ISO: 2026-08-30
  if (
    groups.length >= 3 &&
    /^\d{4}$/.test(groups[0]) &&
    /^\d{1,2}$/.test(groups[1]) &&
    /^\d{1,2}$/.test(groups[2])
  ) {
    return toIsoDate(
      Number(groups[0]),
      Number(groups[1]) - 1,
      Number(groups[2])
    );
  }

  // Numeric: dd/mm/yyyy or mm/dd/yyyy
  if (
    groups.length >= 2 &&
    /^\d+$/.test(groups[0]) &&
    /^\d+$/.test(groups[1])
  ) {
    const yearRaw =
      groups[2] && /^\d+$/.test(groups[2]) ? Number(groups[2]) : null;
    return parseNumericDateParts(
      Number(groups[0]),
      Number(groups[1]),
      yearRaw,
      referenceDate
    );
  }

  // "30 August 2026" / "16th September 2026"
  if (
    groups.length >= 2 &&
    /^\d+$/.test(groups[0]) &&
    MONTHS[(groups[1] || "").toLowerCase()] !== undefined
  ) {
    const yearRaw =
      groups[2] && /^\d+$/.test(groups[2]) ? Number(groups[2]) : null;
    return parseMonthNameDate(
      groups[1],
      Number(groups[0]),
      yearRaw,
      referenceDate
    );
  }

  // "August 30, 2026"
  if (
    groups.length >= 2 &&
    MONTHS[(groups[0] || "").toLowerCase()] !== undefined &&
    /^\d+$/.test(groups[1])
  ) {
    const yearRaw =
      groups[2] && /^\d+$/.test(groups[2]) ? Number(groups[2]) : null;
    return parseMonthNameDate(
      groups[0],
      Number(groups[1]),
      yearRaw,
      referenceDate
    );
  }

  // "Thursday 20th 2026" (weekday + day + year, no month)
  if (
    groups.length >= 3 &&
    WEEKDAYS[(groups[0] || "").toLowerCase()] !== undefined &&
    /^\d+$/.test(groups[1]) &&
    /^\d{4}$/.test(groups[2])
  ) {
    return resolveWeekdayDayYear(
      groups[0],
      Number(groups[1]),
      Number(groups[2]),
      referenceDate
    );
  }

  return null;
}

function extractDueDate(text: string, emailDate?: string): string | null {
  const referenceDate = emailDate ? new Date(emailDate) : new Date();

  // Phrases that clearly mean a deadline (never the email "sent" date).
  // Covers: Last Date:, deadline, on or before, submit by, due on, etc.
  const dueContextPatterns: RegExp[] = [
    new RegExp(
      `\\b${DUE_LABEL}\\s*[:\\-–—]?\\s*(\\d{4})[\\/\\-.](\\d{1,2})[\\/\\-.](\\d{1,2})\\b`,
      "gi"
    ),
    new RegExp(
      `\\b${DUE_LABEL}\\s*[:\\-–—]?\\s*(\\d{1,2})[\\/\\-.](\\d{1,2})[\\/\\-.](\\d{2,4})\\b`,
      "gi"
    ),
    // "Last Date: 28 August 2026, 11:59 PM"
    // "on or before 16th September 2026 EOD"
    new RegExp(
      `\\b${DUE_LABEL}\\s*[:\\-–—]?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+([A-Za-z]+)(?:\\s*,?\\s*(\\d{4}))?`,
      "gi"
    ),
    new RegExp(
      `\\b${DUE_LABEL}\\s*[:\\-–—]?\\s*([A-Za-z]+)\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?`,
      "gi"
    ),
    // "deadline ... is midnight Thursday 20th 2026"
    new RegExp(
      `\\b(?:deadline|due(?:\\s+date)?|last\\s*date|submit(?:\\s+by)?)\\b[^.]{0,80}?\\b([A-Za-z]+)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})\\b`,
      "gi"
    ),
    // "midnight Thursday 20th 2026" / "Thursday 20th 2026"
    /\b(?:midnight|noon|eod)?\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})\b/gi,
  ];

  for (const pattern of dueContextPatterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const iso = dateFromMatch(match, referenceDate);
      if (iso) return iso;
    }
  }

  // Standalone labeled snippets anywhere in flattened HTML text.
  const labeledSnippets = text.match(
    /\b(?:last\s*date|due\s*date|deadline|submission\s*(?:date|deadline))\s*[:\-–—]\s*[^.]{3,80}/gi
  );

  if (labeledSnippets) {
    const loosePatterns: RegExp[] = [
      /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
      /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,
      /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s*,?\s*(\d{4}))?/,
      /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/,
      /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})/,
    ];

    for (const snippet of labeledSnippets) {
      for (const pattern of loosePatterns) {
        const match = snippet.match(pattern);
        if (!match) continue;
        const iso = dateFromMatch(match, referenceDate);
        if (iso) return iso;
      }
    }
  }

  // No due date found in the email content — do NOT use the email sent date.
  return null;
}

function extractCourseCode(text: string) {
  const bracket = text.match(/\[([A-Z]{2,}\d{2,}[A-Z0-9]*)\]/i);
  if (bracket?.[1]) return bracket[1].toUpperCase();

  const bare = text.match(/\b([A-Z]{2,}\d{3,}[A-Z0-9]*)\b/);
  if (bare?.[1]) return bare[1].toUpperCase();

  return null;
}

function extractCourse(subject: string, body: string) {
  const cleaned = cleanSubject(subject);
  const combined = `${cleaned}\n${body}`;

  // "Assignment 1 : Probability & Statistics [MA2103]"
  const afterColon = cleaned.match(
    new RegExp(
      `${ASSIGNMENT_LABEL}\\s*[\\d\\s]*(?:and\\s*\\d+)?\\s*[:\\-–—]\\s*(.+)$`,
      "i"
    )
  );
  if (afterColon?.[1]) {
    let course = afterColon[1]
      .replace(/\s*[-–—].*$/, "")
      .replace(/\b(?:link|submit|submission|onedrive|form).*$/i, "")
      .trim();
    if (course.length >= 2) return titleCase(course);
  }

  // "SWS Assignment 1 and 2" / "DBMS Assignment 3"
  const codePrefix = cleaned.match(
    new RegExp(`^([A-Z]{2,}[A-Z0-9]*)\\s+${ASSIGNMENT_LABEL}\\b`, "i")
  );
  if (codePrefix?.[1]) return codePrefix[1].toUpperCase();

  // "Operating Systems Assignment 2"
  const namePrefix = cleaned.match(
    new RegExp(
      `^([A-Za-z][A-Za-z0-9 &\\-]{1,40}?)\\s+${ASSIGNMENT_LABEL}\\b`,
      "i"
    )
  );
  if (namePrefix?.[1]) {
    const name = namePrefix[1].trim();
    // Reject boilerplate subject prefixes like "OneDrive Link for Tutorial 1..."
    if (
      !/(?:fw|fwd|re|link|onedrive|please|submit|submission|for)\b/i.test(
        name
      )
    ) {
      return titleCase(name);
    }
  }

  // "… Tutorial 1 Assignment Submission" with no clear course code
  if (/\btutorial\s*\d+\s+assignment\b/i.test(cleaned)) {
    return "Tutorial";
  }

  // "Link to submit Assignment 1 : ..." already handled; try body form link text
  const formLink = body.match(
    new RegExp(
      `(${ASSIGNMENT_LABEL}\\s*[\\d\\s]*(?:and\\s*\\d+)?\\s*[:\\-–—]\\s*[^\\n]{3,80}?)\\s*[-–—]\\s*(?:fill\\s+out\\s+form|form)`,
      "i"
    )
  );
  if (formLink?.[1]) {
    const coursePart = formLink[1].replace(
      new RegExp(`^${ASSIGNMENT_LABEL}\\s*[\\d\\s]*(?:and\\s*\\d+)?\\s*[:\\-–—]\\s*`, "i"),
      ""
    );
    if (coursePart.trim()) return titleCase(coursePart.trim());
  }

  // "Scripting Workshop Assignment(CSE)"
  const workshop = body.match(
    /\b([A-Za-z][A-Za-z0-9 &]{2,40}?)\s+Assignment\s*\(/i
  );
  if (workshop?.[1]) return titleCase(workshop[1].trim());

  const courseLine = body.match(
    /\b(?:course|class|subject)\s*(?:name)?\s*[:\-–—]\s*([^\n\r,]{2,60})/i
  );
  if (courseLine?.[1]) return titleCase(courseLine[1].trim());

  const code = extractCourseCode(combined);
  if (code) return code;

  return "Gmail";
}

function extractAssignmentPart(subject: string, body: string) {
  const cleaned = cleanSubject(subject);

  // "SWS Assignment 1 and 2" → "Assignment 1 and 2"
  const withCourse = cleaned.match(
    new RegExp(
      `^(?:[A-Z]{2,}[A-Z0-9]*|[A-Za-z][A-Za-z0-9 &\\-]{1,40}?)\\s+(${ASSIGNMENT_LABEL}\\s*(?:\\d+(?:\\s+and\\s+\\d+)?)?)\\b`,
      "i"
    )
  );
  if (
    withCourse?.[1] &&
    !/^(link|onedrive|please|submit|submission)$/i.test(
      cleaned.slice(0, withCourse.index || 0).trim()
    )
  ) {
    // Only accept if the prefix before assignment looks like a course code/name
    const prefix = cleaned
      .slice(0, cleaned.toLowerCase().indexOf(withCourse[1].toLowerCase()))
      .trim();
    if (
      prefix &&
      !/(?:link|onedrive|please|submit|submission|\bfor\b)/i.test(prefix)
    ) {
      return titleCase(withCourse[1].trim());
    }
  }

  // "Link to submit Assignment 1 : Probability..." → "Assignment 1"
  const submitLink = cleaned.match(
    new RegExp(
      `(?:link\\s+to\\s+submit|submit|submission)\\s+(${ASSIGNMENT_LABEL}\\s*\\d*)\\b`,
      "i"
    )
  );
  if (submitLink?.[1]) {
    return titleCase(submitLink[1].trim());
  }

  // "OneDrive Link for Tutorial 1 Assignment Submission" → "Tutorial 1 Assignment"
  const tutorialAssignment = cleaned.match(
    /\b((?:tutorial|lab|quiz|project)\s*\d+\s+assignment)\b/i
  );
  if (tutorialAssignment?.[1]) {
    return titleCase(tutorialAssignment[1].trim());
  }

  // "Assignment 1 : ..." / "Assignments 1 and 2"
  const bare = cleaned.match(
    new RegExp(
      `\\b(${ASSIGNMENT_LABEL}\\s*(?:\\d+(?:\\s+and\\s+\\d+)?)?)\\b`,
      "i"
    )
  );
  if (bare?.[1]) {
    return titleCase(bare[1].trim());
  }

  // Body: "Please submit Assignment 1: ..."
  const bodyAssign = body.match(
    new RegExp(
      `\\b((?:please\\s+)?submit\\s+)?(${ASSIGNMENT_LABEL}\\s*(?:\\d+(?:\\s+and\\s+\\d+)?)?)\\b`,
      "i"
    )
  );
  if (bodyAssign?.[2]) {
    return titleCase(bodyAssign[2].trim());
  }

  let title = cleaned
    .replace(/^(?:link\s+to\s+submit|onedrive\s+link\s+for)\s+/i, "")
    .replace(/\s+(?:submission|submit|link).*$/i, "")
    .replace(
      /\s*[\-–—|:]\s*(?:submission\s+)?(?:deadline|due(?:\s+date)?|submit|last\s*date).*$/i,
      ""
    )
    .replace(/\b(?:due|deadline|submit(?:\s+by)?|last\s*date)\b.*$/i, "")
    .replace(/\s*[\-–—|]\s*$/g, "")
    .trim();

  if (!title) {
    title = cleaned || "Untitled Assignment";
  }

  return titleCase(title);
}

function buildDisplayTitle(course: string, assignmentPart: string) {
  if (
    course &&
    course !== "Gmail" &&
    !assignmentPart.toLowerCase().includes(course.toLowerCase())
  ) {
    // "Probability & Statistics [MA2103]" + "Assignment 1"
    // → "Probability & Statistics [MA2103] Assignment 1"
    return `${course} ${assignmentPart}`.trim();
  }

  return assignmentPart;
}

function normalizeAndTitle(course: string, assignmentPart: string) {
  // Avoid "Tutorial Tutorial 1 Assignment"
  if (
    course.toLowerCase() === "tutorial" &&
    /^tutorial\b/i.test(assignmentPart)
  ) {
    return {
      course: "Tutorial",
      title: titleCase(assignmentPart),
    };
  }

  return {
    course,
    title: buildDisplayTitle(course, assignmentPart),
  };
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
  /** Used only to infer year/month when the due date is incomplete — never as the due date itself */
  emailDate?: string;
}): ParsedAssignmentEmail {
  const subject = input.subject || "";
  const body = stripHtml(input.body || "");
  const combined = `${subject}\n${body}`;

  const course = extractCourse(subject, body);
  const assignmentPart = extractAssignmentPart(subject, body);
  const named = normalizeAndTitle(course, assignmentPart);

  return {
    title: named.title,
    course: named.course,
    dueDate: extractDueDate(combined, input.emailDate),
    description: body.slice(0, 2000) || subject,
    sender: input.sender || "",
    keywords: findKeywords(combined),
  };
}
