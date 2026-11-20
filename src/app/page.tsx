import { SignInButton } from "@/components/SignInButton";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Outreach</h1>
      <p className="text-lg text-neutral-600">
        Paste a contact list, write one email, and schedule a personal copy to each person from your own Gmail.
        Sends are spaced out and nobody gets emailed twice.
      </p>
      <div><SignInButton /></div>
      <p className="text-sm text-neutral-500">
        The app asks for permission to send email as you. It cannot read your inbox.
      </p>
    </main>
  );
}
