import { disconnectGmailAction, savePushoverAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { ago } from "@/lib/format";
import { getSessionEmail } from "@/lib/session";
import { getSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

export default async function ConnectPage({ searchParams }: Props) {
  const { ok, error } = await searchParams;
  const email = await getSessionEmail();

  if (!email) {
    return (
      <>
        <h1>Connect</h1>
        <Flash error={error} />
        <section className="card hero">
          <p className="lead">Get a loud, can't-miss alarm on your phone the moment DoorDash says your order is here.</p>
          <ol className="steps">
            <li>Sign in with Google so Door Alarm can watch for DoorDash emails (read-only).</li>
            <li>Add your Pushover keys so it can ring your phone.</li>
            <li>Send a test alarm to make sure it breaks through Silent and Do Not Disturb.</li>
          </ol>
          <a className="btn btn-google" href="/api/auth/google">
            <GoogleIcon /> Sign in with Google
          </a>
          <p className="fine">Only DoorDash emails are ever read, and only their subject and preview. Nothing from your inbox is stored.</p>
        </section>
      </>
    );
  }

  const s = await getSettings();
  const gmailOk = s.hasGoogle && !s.needsReconnect;

  return (
    <>
      <h1>Connect</h1>
      <Flash ok={ok} error={error} />

      <section className="card">
        <div className="row-between">
          <h2>Gmail</h2>
          <span className={gmailOk ? "pill pill-ok" : "pill pill-warn"}>{gmailOk ? "Connected" : "Needs sign-in"}</span>
        </div>
        <p className="muted">
          Signed in as <strong>{email}</strong>
        </p>
        {gmailOk ? (
          <p className="muted small">
            Last check {ago(s.lastPollAt)}
            {s.lastPollError ? <span className="text-warn"> · {s.lastPollError}</span> : null}
          </p>
        ) : (
          <p className="text-warn small">Google access expired or isn't granted yet. Sign in again to resume watching.</p>
        )}
        <div className="actions">
          <a className={gmailOk ? "btn btn-ghost" : "btn btn-google"} href="/api/auth/google">
            <GoogleIcon /> {gmailOk ? "Reconnect Google" : "Sign in with Google"}
          </a>
          {s.hasGoogle ? (
            <form action={disconnectGmailAction}>
              <Submit className="btn btn-ghost btn-danger" pending="Disconnecting…">Disconnect Gmail</Submit>
            </form>
          ) : null}
        </div>
      </section>

      <section className="card">
        <div className="row-between">
          <h2>Pushover</h2>
          <span className={s.hasPushover ? "pill pill-ok" : "pill pill-warn"}>{s.hasPushover ? "Saved" : "Not set"}</span>
        </div>
        <form action={savePushoverAction} className="stack">
          <label className="field">
            <span>User key</span>
            <input name="user" type="password" autoComplete="off" spellCheck={false} placeholder={s.hasPushover ? "•••••••• saved — leave blank to keep" : "30-character user key"} />
            <small>On the Pushover dashboard after you log in at pushover.net.</small>
          </label>
          <label className="field">
            <span>App API token</span>
            <input name="token" type="password" autoComplete="off" spellCheck={false} placeholder={s.hasPushover ? "•••••••• saved — leave blank to keep" : "30-character app token"} />
            <small>Create an application at pushover.net/apps/build and copy its API token.</small>
          </label>
          <Submit pending="Saving…">Save Pushover keys</Submit>
        </form>
        <p className="fine">Keys and Google tokens are encrypted (AES-256-GCM) before they're stored.</p>
      </section>

      <form action="/api/auth/logout" method="post" className="center">
        <button className="link" type="submit">Sign out of Door Alarm</button>
      </form>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
