import { cancelAlarmAction, checkNowAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { ago, fmtTime } from "@/lib/format";
import { EXPIRE_SECONDS, getReceipt, type ReceiptStatus } from "@/lib/pushover";
import { requireSession } from "@/lib/session";
import { getSecrets, getSettings, recentEvents, type LogEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

const LABEL: Record<LogEvent["kind"], string> = {
  detection: "Detected",
  alert: "Alarm sent",
  suppressed: "Not rung",
  test: "Test alarm",
  error: "Error",
};

export default async function LogPage({ searchParams }: Props) {
  await requireSession();
  const { ok, error } = await searchParams;
  const [s, secrets, events] = await Promise.all([getSettings(), getSecrets(), recentEvents(20)]);

  // Look up live acknowledgement status for alarms that may still be ringing.
  const live = new Map<string, ReceiptStatus | null>();
  if (secrets.pushoverToken) {
    const recent = events.filter(
      (e) => e.receipt && Date.now() - new Date(e.created_at).getTime() < (EXPIRE_SECONDS + 60) * 1000,
    );
    await Promise.all(recent.map(async (e) => live.set(e.receipt!, await getReceipt(secrets.pushoverToken!, e.receipt!))));
  }

  return (
    <>
      <div className="row-between">
        <h1>Log</h1>
        <form action={checkNowAction}>
          <Submit className="btn btn-ghost btn-sm" pending="Checking…">Check now</Submit>
        </form>
      </div>
      <Flash ok={ok} error={error} />

      <section className="card status-strip">
        <span className={s.enabled ? "dot dot-ok" : "dot"} aria-hidden="true" />
        <span>
          {s.enabled ? "Watching for DoorDash" : "Switched off"} · last check {ago(s.lastPollAt)}
          {s.lastAlertAt ? ` · last alarm ${ago(s.lastAlertAt)}` : ""}
        </span>
      </section>

      {events.length === 0 ? (
        <section className="card empty">
          <p>No detections yet.</p>
          <p className="muted small">When a DoorDash email matches an arrival phrase, it shows up here with the alarm that was sent.</p>
        </section>
      ) : (
        <ol className="log">
          {events.map((e) => {
            const st = e.receipt ? live.get(e.receipt) : undefined;
            return (
              <li key={e.id} className={`log-item k-${e.kind}`}>
                <div className="row-between">
                  <span className={`badge b-${e.kind}`}>{LABEL[e.kind]}</span>
                  <time className="muted small" dateTime={e.created_at}>{fmtTime(e.created_at, s.timezone)}</time>
                </div>
                {e.subject ? <p className="subject">{e.subject}</p> : null}
                <p className="muted small">
                  {e.phrase ? <>Matched “{e.phrase}”</> : null}
                  {e.phrase && e.detail ? " · " : null}
                  {e.detail}
                </p>
                {st ? (
                  <div className="row-between">
                    <span className={st.acknowledged ? "pill pill-ok" : st.expired ? "pill" : "pill pill-alert"}>
                      {st.acknowledged ? `Acknowledged ${fmtTime(st.acknowledgedAt, s.timezone)}` : st.expired ? "Expired" : "Ringing"}
                    </span>
                    {!st.acknowledged && !st.expired ? (
                      <form action={cancelAlarmAction}>
                        <input type="hidden" name="receipt" value={e.receipt!} />
                        <Submit className="btn btn-ghost btn-sm btn-danger" pending="Stopping…">Stop</Submit>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
