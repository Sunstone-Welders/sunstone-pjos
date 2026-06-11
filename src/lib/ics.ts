// ============================================================================
// ICS Calendar File Generator — src/lib/ics.ts
// ============================================================================
// Generates RFC 5545-compliant .ics (iCalendar) file content for bookings.
// No external libraries — pure string template.
// ============================================================================

interface ICSParams {
  summary: string;
  description: string;
  location: string;
  startTime: Date;
  endTime: Date;
  organizerName: string;
  organizerEmail?: string;
  uid: string;
}

/**
 * Format a Date to iCalendar UTC timestamp: YYYYMMDDTHHmmssZ
 */
function toICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape special characters in iCalendar text values.
 * Per RFC 5545: backslash, semicolon, comma, and newlines must be escaped.
 */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generate a .ics (iCalendar) file string for a booking.
 */
export function generateICS(params: ICSParams): string {
  const {
    summary,
    description,
    location,
    startTime,
    endTime,
    organizerName,
    organizerEmail,
    uid,
  } = params;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sunstone Studio//Booking//EN',
    'METHOD:PUBLISH',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}@sunstonepj.app`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(startTime)}`,
    `DTEND:${toICSDate(endTime)}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`,
  ];

  if (location) {
    lines.push(`LOCATION:${escapeICS(location)}`);
  }

  if (organizerEmail) {
    lines.push(`ORGANIZER;CN=${escapeICS(organizerName)}:mailto:${organizerEmail}`);
  }

  lines.push('STATUS:CONFIRMED');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}
