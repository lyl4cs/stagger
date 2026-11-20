import type { Contact } from "./parse";

export type CampaignStatus = "draft" | "scheduled" | "done" | "needs_reauth";
export type RecipientStatus = "pending" | "queued" | "sending" | "sent" | "skipped" | "error";

export type Campaign = {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  body: string;
  sender_name: string;
  gap_minutes: number;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  track_opens: boolean;
  status: CampaignStatus;
  start_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Recipient = {
  id: string;
  campaign_id: string;
  user_id: string;
  position: number;
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  location: string;
  custom_line: string;
  status: RecipientStatus;
  send_at: string | null;
  claimed_at: string | null;
  sent_at: string | null;
  attempts: number;
  error: string | null;
  gmail_message_id: string | null;
  thread_id: string | null;
  opened_at: string | null;
  open_count: number;
  replied_at: string | null;
  reply_checked_at: string | null;
};

export function toContact(r: Recipient): Contact {
  return {
    firstName: r.first_name, lastName: r.last_name, email: r.email, title: r.title,
    company: r.company, location: r.location, customLine: r.custom_line,
  };
}

export function fromContact(c: Contact) {
  return {
    email: c.email, first_name: c.firstName, last_name: c.lastName, title: c.title,
    company: c.company, location: c.location, custom_line: c.customLine,
  };
}
