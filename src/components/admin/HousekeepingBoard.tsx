"use client";

import { useMemo, useState, useTransition } from "react";
import { updateRoom } from "@/app/admin/actions";
import { assignTask, createTask, reportIssue, updateTask } from "@/app/admin/operations";
import type { BoardRoom, HousekeepingTask, TaskKind, TaskStatus } from "@/lib/data/operations";
import { roomStatus, type RoomStatus } from "@/lib/room-status";
import type { Housekeeping } from "@/lib/data/types";
import Dialog from "./Dialog";
import { toast } from "../ui/Toaster";

export const STATUS: Record<RoomStatus, { label: string; badge: string; note: string }> = {
  dirty: { label: "Dirty", badge: "cancelled", note: "Needs cleaning" },
  cleaning: { label: "Cleaning", badge: "pending", note: "Being cleaned now" },
  clean: { label: "Clean", badge: "confirmed", note: "Clean, waiting for inspection" },
  inspected: { label: "Inspected", badge: "confirmed", note: "Ready for a guest" },
  occupied: { label: "Occupied", badge: "checked_in", note: "A guest is staying" },
  out_of_service: { label: "Out of service", badge: "checked_out", note: "Not sold" },
};
const ORDER: RoomStatus[] = ["dirty", "cleaning", "clean", "inspected", "occupied", "out_of_service"];
const SETTABLE: Housekeeping[] = ["dirty", "cleaning", "clean", "inspected"];

const KINDS: { id: TaskKind; label: string }[] = [
  { id: "clean", label: "Clean" },
  { id: "inspect", label: "Inspect" },
  { id: "turndown", label: "Turn-down" },
  { id: "maintenance", label: "Repair" },
  { id: "other", label: "Other" },
];
const kindLabel = (k: TaskKind) => KINDS.find((x) => x.id === k)?.label ?? k;
const PRIORITY: Record<number, string> = { 1: "Urgent", 2: "Normal", 3: "Low" };

type Props = {
  rooms: BoardRoom[];
  tasks: HousekeepingTask[];
  staff: { user_id: string; full_name: string }[];
  me: string;
  canAssign: boolean;
  canWrite: boolean;
  live: boolean;
  today: string;
};

export default function HousekeepingBoard({ rooms, tasks, staff, me, canAssign, canWrite, live, today }: Props) {
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<RoomStatus | "all">("all");
  const [view, setView] = useState<"mine" | "all">(canAssign ? "all" : "mine");
  const [report, setReport] = useState<BoardRoom | null>(null);
  const [issue, setIssue] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [adding, setAdding] = useState(false);
  const [task, setTask] = useState({ room: rooms[0]?.room_id ?? "", kind: "clean" as TaskKind, due: today, assignee: "", notes: "", priority: 2 as 1 | 2 | 3 });

  const withStatus = useMemo(() => rooms.map((r) => ({ ...r, status: roomStatus(r) })), [rooms]);
  const counts = useMemo(() => Object.fromEntries(ORDER.map((s) => [s, withStatus.filter((r) => r.status === s).length])) as Record<RoomStatus, number>, [withStatus]);
  const shown = filter === "all" ? withStatus : withStatus.filter((r) => r.status === filter);
  const roomNo = (id: string) => rooms.find((r) => r.room_id === id)?.number ?? "?";
  const name = (id: string | null) => (id ? staff.find((s) => s.user_id === id)?.full_name ?? "A colleague" : "Unassigned");
  const openTasks = tasks.filter((t) => t.status === "open" || t.status === "in_progress");
  const listed = view === "mine" ? openTasks.filter((t) => t.assigned_to === me || !t.assigned_to) : openTasks;

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>, done?: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(done ?? res.message ?? "Saved");
      else toast.error(res.message ?? "Something went wrong");
    });

  const setStatus = (r: BoardRoom, h: Housekeeping) => act(() => updateRoom(r.room_id, { housekeeping: h }), `Room ${r.number}: ${STATUS[h].label.toLowerCase()}`);
  const move = (t: HousekeepingTask, s: TaskStatus) =>
    act(() => updateTask(t.id, s), s === "in_progress" ? `Started: room ${roomNo(t.room_id)}` : s === "done" ? `Done: room ${roomNo(t.room_id)}` : s === "cancelled" ? "Task cancelled" : "Task reopened");

  const sendIssue = () =>
    report &&
    start(async () => {
      const res = await reportIssue(report.room_id, issue, urgent);
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message ?? "Reported");
      setReport(null);
      setIssue("");
      setUrgent(false);
    });

  const addTask = () =>
    start(async () => {
      const res = await createTask(task.room, task.kind, task.due || null, task.assignee || null, task.notes, task.priority);
      if (!res.ok) return void toast.error(res.message);
      toast.success(`Task added for room ${roomNo(task.room)}`);
      setAdding(false);
      setTask((t) => ({ ...t, notes: "" }));
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {!live && <p className="a-hint">Housekeeping needs Supabase. Connect it to see the live board.</p>}

      <div className="a-seg" role="group" aria-label="Filter rooms by status" style={{ flexWrap: "wrap" }}>
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
          All rooms ({rooms.length})
        </button>
        {ORDER.map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {STATUS[s].label} ({counts[s]})
          </button>
        ))}
      </div>

      <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(230px, 100%), 1fr))", gap: 12 }}>
        {shown.map((r) => (
          <li key={r.room_id} className="a-panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }} aria-label={`Room ${r.number}, ${STATUS[r.status].label}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span>
                <span style={{ fontSize: "1.3rem", fontWeight: 600 }}>{r.number}</span>
                <span className="a-muted" style={{ display: "block", fontSize: "0.74rem" }}>
                  {r.room_type}
                  {r.floor ? ` · ${r.floor} floor` : ""}
                </span>
              </span>
              <span className="a-badge" data-s={STATUS[r.status].badge} title={STATUS[r.status].note}>
                {STATUS[r.status].label}
              </span>
            </div>
            {(r.arriving || r.departing || r.blocked || r.open_issues > 0 || (r.out_of_service && r.service_note)) && (
              <p className="a-hint" style={{ margin: 0 }}>
                {[
                  r.departing && "Departure today",
                  r.arriving && "Arrival today",
                  r.blocked && "Blocked for maintenance",
                  r.open_issues > 0 && `${r.open_issues} repair${r.open_issues > 1 ? "s" : ""} reported`,
                  r.out_of_service && r.service_note,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {canWrite && !r.out_of_service && (
              <div className="a-seg" role="group" aria-label={`Set status of room ${r.number}`}>
                {SETTABLE.map((h) => (
                  <button key={h} type="button" aria-pressed={r.housekeeping === h} disabled={pending || !live} onClick={() => r.housekeeping !== h && setStatus(r, h)}>
                    {STATUS[h].label}
                  </button>
                ))}
              </div>
            )}
            {canWrite && (
              <button type="button" className="a-btn a-btn--sm a-btn--ghost" style={{ alignSelf: "flex-start" }} disabled={!live} onClick={() => setReport(r)}>
                Report a problem
              </button>
            )}
          </li>
        ))}
      </ul>

      <section className="a-panel" aria-labelledby="tasks-h">
        <div className="a-panel-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <h2 id="tasks-h" className="a-h2">
            Tasks<span className="a-count">{openTasks.length}</span>
          </h2>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="a-seg" role="group" aria-label="Which tasks">
              <button type="button" aria-pressed={view === "mine"} onClick={() => setView("mine")}>
                Mine &amp; unassigned
              </button>
              <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}>
                All open
              </button>
            </span>
            {canWrite && (
              <button type="button" className="a-btn a-btn--sm a-btn--primary" disabled={!live || !rooms.length} onClick={() => setAdding(true)}>
                + New task
              </button>
            )}
          </span>
        </div>
        {listed.length === 0 ? (
          <div className="a-empty">
            <strong>Nothing to do</strong>
            <span>{view === "mine" ? "No tasks for you right now." : "No open tasks."}</span>
          </div>
        ) : (
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {listed.map((t) => {
              const mine = t.assigned_to === me;
              const mayUpdate = canWrite && (canAssign || mine || !t.assigned_to);
              return (
                <li key={t.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--a-line)" }}>
                  <span style={{ minWidth: 0, flex: "1 1 220px" }}>
                    <strong>
                      Room {roomNo(t.room_id)} · {kindLabel(t.kind)}
                    </strong>
                    {t.priority === 1 && (
                      <span className="a-badge" data-s="cancelled" style={{ marginLeft: 8 }}>
                        Urgent
                      </span>
                    )}
                    <span className="a-hint" style={{ display: "block" }}>
                      {t.status === "in_progress" ? "In progress" : "To do"} · due {t.due_on === today ? "today" : t.due_on}
                      {canAssign ? "" : ` · ${name(t.assigned_to)}`}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </span>
                  </span>
                  {canAssign && (
                    <label className="a-field" style={{ minWidth: 150 }}>
                      <span className="sr-only">Assign task in room {roomNo(t.room_id)}</span>
                      <select className="a-input" style={{ minHeight: 32 }} value={t.assigned_to ?? ""} disabled={pending || !live} onChange={(e) => act(() => assignTask(t.id, e.target.value || null))}>
                        <option value="">Unassigned</option>
                        {staff.map((s) => (
                          <option key={s.user_id} value={s.user_id}>
                            {s.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {mayUpdate && (
                    <span style={{ display: "flex", gap: 6 }}>
                      {t.status === "open" && (
                        <button type="button" className="a-btn a-btn--sm" disabled={pending || !live} onClick={() => move(t, "in_progress")}>
                          Start
                        </button>
                      )}
                      <button type="button" className="a-btn a-btn--sm a-btn--primary" disabled={pending || !live} onClick={() => move(t, "done")}>
                        Done
                      </button>
                      {canAssign && (
                        <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={pending || !live} onClick={() => move(t, "cancelled")}>
                          Cancel
                        </button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog
        open={Boolean(report)}
        onClose={() => setReport(null)}
        title={`Report a problem in room ${report?.number ?? ""}`}
        description="Maintenance is notified straight away. Say what's wrong and where."
        onSubmit={sendIssue}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setReport(null)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="a-btn a-btn--primary" disabled={pending || issue.trim().length < 3}>
              {pending && <span className="a-spin" aria-hidden="true" />}
              Send report
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="a-field">
            <span className="a-label">What&apos;s wrong?</span>
            <textarea className="a-input" rows={3} maxLength={500} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="e.g. Bathroom tap is leaking" required />
          </label>
          <label className="a-check">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            Urgent — the room can&apos;t be used like this
          </label>
        </div>
      </Dialog>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="New task"
        onSubmit={addTask}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setAdding(false)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="a-btn a-btn--primary" disabled={pending || !task.room}>
              {pending && <span className="a-spin" aria-hidden="true" />}
              Add task
            </button>
          </>
        }
      >
        <div className="a-grid-2">
          <label className="a-field">
            <span className="a-label">Room</span>
            <select className="a-input" value={task.room} onChange={(e) => setTask({ ...task, room: e.target.value })}>
              {rooms.map((r) => (
                <option key={r.room_id} value={r.room_id}>
                  {r.number} · {r.room_type}
                </option>
              ))}
            </select>
          </label>
          <label className="a-field">
            <span className="a-label">Task</span>
            <select className="a-input" value={task.kind} onChange={(e) => setTask({ ...task, kind: e.target.value as TaskKind })}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="a-field">
            <span className="a-label">Due</span>
            <input className="a-input" type="date" min={today} value={task.due} onChange={(e) => setTask({ ...task, due: e.target.value })} />
          </label>
          <label className="a-field">
            <span className="a-label">Priority</span>
            <select className="a-input" value={task.priority} onChange={(e) => setTask({ ...task, priority: Number(e.target.value) as 1 | 2 | 3 })}>
              {[1, 2, 3].map((p) => (
                <option key={p} value={p}>
                  {PRIORITY[p]}
                </option>
              ))}
            </select>
          </label>
          {canAssign && (
            <label className="a-field a-span-2">
              <span className="a-label">Assign to</span>
              <select className="a-input" value={task.assignee} onChange={(e) => setTask({ ...task, assignee: e.target.value })}>
                <option value="">Anyone on housekeeping</option>
                {staff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="a-field a-span-2">
            <span className="a-label">Notes</span>
            <input className="a-input" maxLength={500} value={task.notes} onChange={(e) => setTask({ ...task, notes: e.target.value })} placeholder="e.g. Extra towels for a family" />
          </label>
        </div>
      </Dialog>
    </div>
  );
}
