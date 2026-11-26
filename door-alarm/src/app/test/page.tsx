import Link from "next/link";
import { cancelAlarmAction, sendTestAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { fmtTime } from "@/lib/format";
import { getReceipt } from "@/lib/pushover";
import { requireSession } from "@/lib/session";
import { getSecrets, getSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ ok?: string; error?: string; receipt?: string }> };

export default async function TestPage({ searchParams }: Props) {
  await requireSession();
  const { ok, error, receipt } = await searchParams;
  const [s, secrets] = await Promise.all([getSettings(), getSecrets()]);
  const status =
    receipt && secrets.pushoverToken && /^[A-Za-z0-9]{30}$/.test(receipt)
      ? await getReceipt(secrets.pushoverToken, receipt)
      : null;

  return (
    <>
      <h1>Test</h1>
      <Flash ok={ok} error={error} />

      <section className="card hero">
        <p className="lead">Put your phone on Silent and turn on Do Not Disturb (or your Focus mode), then send a test.</p>
        {s.hasPushover ? (
          <form action={sendTestAction}>
            <Submit className="btn btn-big" pending="Sending…">Send test alarm</Submit>
          </form>
        ) : (
          <Link className="btn" href="/connect">Add Pushover keys first</Link>
        )}
        <p className="fine">It should ring loudly within a few seconds and repeat every 30 seconds until you open the notification and tap Acknowledge.</p>
      </section>

      {receipt ? (
        <section className="card">
          <div className="row-between">
            <h2>Test alarm</h2>
            <span className={status?.acknowledged ? "pill pill-ok" : status?.expired ? "pill" : "pill pill-alert"}>
              {status?.acknowledged ? "Acknowledged" : status?.expired ? "Expired" : "Ringing"}
            </span>
          </div>
          <dl className="kv">
            <dt>Last delivered</dt>
            <dd>{fmtTime(status?.lastDeliveredAt ?? null, s.timezone)}</dd>
            <dt>Acknowledged</dt>
            <dd>{fmtTime(status?.acknowledgedAt ?? null, s.timezone)}</dd>
          </dl>
          <div className="actions">
            <Link className="btn btn-ghost" href={`/test?receipt=${receipt}`}>Refresh status</Link>
            {!status?.acknowledged && !status?.expired ? (
              <form action={cancelAlarmAction}>
                <input type="hidden" name="receipt" value={receipt} />
                <input type="hidden" name="back" value="/test" />
                <Submit className="btn btn-ghost btn-danger" pending="Stopping…">Stop alarm</Submit>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="card">
        <h2>Didn't break through?</h2>
        <ul className="tips">
          <li><strong>iPhone:</strong> Settings → Notifications → Pushover → turn on <em>Critical Alerts</em>.</li>
          <li><strong>Focus:</strong> Settings → Focus → each Focus you use → Apps → add Pushover (and allow Time Sensitive).</li>
          <li><strong>Android:</strong> In the Pushover app, Settings → enable overriding Do Not Disturb / silent for emergency priority, and allow Pushover in your DND exceptions.</li>
          <li>Make sure the Pushover app is logged in on the same account as your user key.</li>
        </ul>
      </section>
    </>
  );
}
