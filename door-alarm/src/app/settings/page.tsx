import { saveSettingsAction } from "@/app/actions";
import { Flash } from "@/components/Flash";
import { Submit } from "@/components/Submit";
import { SOUNDS } from "@/lib/pushover";
import { requireSession } from "@/lib/session";
import { getSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

export default async function SettingsPage({ searchParams }: Props) {
  await requireSession();
  const { ok, error } = await searchParams;
  const s = await getSettings();
  const zones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <h1>Settings</h1>
      <Flash ok={ok} error={error} />
      <form action={saveSettingsAction} className="stack">
        <section className="card">
          <label className="switch-row">
            <span>
              <strong>Door Alarm is on</strong>
              <small>When off, your inbox isn't checked at all.</small>
            </span>
            <input type="checkbox" name="enabled" role="switch" className="switch" defaultChecked={s.enabled} />
          </label>
        </section>

        <section className="card stack">
          <h2>Arrival phrases</h2>
          <label className="field">
            <span>Ring when a DoorDash email contains any of these</span>
            <textarea name="phrases" rows={5} defaultValue={s.phrases.join("\n")} />
            <small>One per line. Matched against the subject and preview text, ignoring case.</small>
          </label>
          <label className="field">
            <span>…unless it also contains</span>
            <textarea name="ignore" rows={4} defaultValue={s.ignorePhrases.join("\n")} />
            <small>Keeps marketing emails ("groceries delivered, 40% off") from setting off the alarm.</small>
          </label>
        </section>

        <section className="card stack">
          <h2>Alarm</h2>
          <label className="field">
            <span>Sound</span>
            <select name="sound" defaultValue={s.sound}>
              {SOUNDS.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <small>Repeats every 30 seconds for up to 5 minutes, until you acknowledge it in Pushover.</small>
          </label>
          <label className="field">
            <span>Cooldown (minutes)</span>
            <input name="cooldown" type="number" inputMode="numeric" min={0} max={240} defaultValue={s.cooldownMinutes} />
            <small>No repeat alarms within this window, so one delivery only rings once.</small>
          </label>
        </section>

        <section className="card stack">
          <label className="switch-row">
            <span>
              <strong>Quiet hours</strong>
              <small>Arrivals are still logged, but the phone won't ring.</small>
            </span>
            <input type="checkbox" name="quietEnabled" role="switch" className="switch" defaultChecked={s.quietEnabled} />
          </label>
          <div className="grid2">
            <label className="field">
              <span>From</span>
              <input name="quietStart" type="time" defaultValue={s.quietStart} />
            </label>
            <label className="field">
              <span>Until</span>
              <input name="quietEnd" type="time" defaultValue={s.quietEnd} />
            </label>
          </div>
          <label className="field">
            <span>Time zone</span>
            <select name="timezone" defaultValue={s.timezone}>
              {zones.map((z) => (
                <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
        </section>

        <div className="sticky-save">
          <Submit pending="Saving…">Save settings</Submit>
        </div>
      </form>
    </>
  );
}
