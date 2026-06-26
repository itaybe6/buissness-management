import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Icon, Input, PageHeader, PageLoader, ErrorState, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useAgreements, useSignatures, useCreateAgreement, useSignAgreement } from "@/api/agreements";
import type { AgreementTemplate, AgreementType } from "@/types/database";

const TYPE_LABELS: Record<AgreementType, string> = {
  work: "תנאי עבודה",
  sexual_harassment: "מניעת הטרדה מינית",
  other: "אחר",
};

export function Agreements() {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const { data: agreements, isLoading, isError, refetch } = useAgreements(businessId);
  const { data: signatures } = useSignatures(businessId, profile?.id);
  const create = useCreateAgreement();
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState<AgreementTemplate | null>(null);

  const isManager = profile && ["manager", "department_manager", "shift_manager"].includes(profile.role);
  const signedSet = new Set((signatures ?? []).filter((s) => s.agreed).map((s) => s.agreement_id));

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="mx-auto max-w-[900px] animate-fadeUp">
      <PageHeader
        title="הסכמים וטפסים"
        subtitle="קריאה וחתימה דיגיטלית"
        actions={isManager ? <Button icon="add" onClick={() => setOpen(true)}>הסכם חדש</Button> : undefined}
      />

      {(agreements ?? []).length === 0 ? (
        <EmptyState icon="draw" title="אין הסכמים" description="צרו הסכמי סודיות, תנאי עבודה ובטיחות לחתימת העובדים." action={isManager ? <Button icon="add" onClick={() => setOpen(true)}>הסכם חדש</Button> : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(agreements ?? []).map((a) => {
            const signed = signedSet.has(a.id);
            return (
              <Card key={a.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-[12px] [background:var(--accent-tint)]"><Icon name="draw" size={23} className="text-accent-2" /></span>
                  {signed ? <Badge tone="success">נחתם</Badge> : <Badge tone="warning">ממתין לחתימה</Badge>}
                </div>
                <div className="mt-3 text-[15px] font-bold">{a.title}</div>
                <div className="mt-0.5 text-[12.5px] text-text-3">{TYPE_LABELS[a.type]}</div>
                <Button variant="secondary" className="mt-4" icon={signed ? "visibility" : "edit_document"} onClick={() => setReading(a)}>
                  {signed ? "צפייה" : "קריאה וחתימה"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {open && (
        <NewAgreementModal
          saving={create.isPending}
          onClose={() => setOpen(false)}
          onSave={async (input) => { await create.mutateAsync({ business_id: businessId!, created_by: profile?.id, ...input }); setOpen(false); }}
        />
      )}

      {reading && (
        <ReadSignModal
          agreement={reading}
          alreadySigned={signedSet.has(reading.id)}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  );
}

function NewAgreementModal({ onClose, onSave, saving }: { onClose: () => void; onSave: (i: { title: string; type: AgreementType; content: string }) => Promise<void>; saving: boolean }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<AgreementType>("work");
  const [content, setContent] = useState("");
  return (
    <Modal open onClose={onClose} title="הסכם חדש" icon="draw" footer={<><Button variant="secondary" onClick={onClose}>ביטול</Button><Button className="flex-1" loading={saving} onClick={() => title.trim() && content.trim() && onSave({ title: title.trim(), type, content })}>שמירה</Button></>}>
      <div className="flex flex-col gap-3.5">
        <Field label="כותרת"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="סוג"><Select value={type} onChange={(e) => setType(e.target.value as AgreementType)}>{(Object.keys(TYPE_LABELS) as AgreementType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</Select></Field>
        <Field label="תוכן ההסכם"><Textarea value={content} onChange={(e) => setContent(e.target.value)} className="h-40" /></Field>
      </div>
    </Modal>
  );
}

function ReadSignModal({ agreement, alreadySigned, onClose }: { agreement: AgreementTemplate; alreadySigned: boolean; onClose: () => void }) {
  const businessId = useBusinessId();
  const { profile } = useAuth();
  const sign = useSignAgreement(businessId);
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#1e1b3a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
  }, []);

  function pos(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent) { drawing.current = true; const { x, y } = pos(e); canvasRef.current!.getContext("2d")!.beginPath(); canvasRef.current!.getContext("2d")!.moveTo(x, y); }
  function move(e: React.PointerEvent) { if (!drawing.current) return; const { x, y } = pos(e); const ctx = canvasRef.current!.getContext("2d")!; ctx.lineTo(x, y); ctx.stroke(); setHasDrawn(true); }
  function up() { drawing.current = false; }
  function clear() { const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHasDrawn(false); }

  async function submit() {
    const data = canvasRef.current!.toDataURL("image/png");
    await sign.mutateAsync({ business_id: businessId!, agreement_id: agreement.id, employee_id: profile!.id, signature_data: data });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={agreement.title} subtitle={TYPE_LABELS[agreement.type]} icon="draw" maxWidth={560}
      footer={alreadySigned ? <Button className="flex-1" onClick={onClose}>סגירה</Button> : <><Button variant="secondary" onClick={onClose}>ביטול</Button><Button className="flex-1" disabled={!hasDrawn} loading={sign.isPending} onClick={submit}>אני מאשר/ת וחותם/ת</Button></>}>
      <div className="mb-4 max-h-[230px] overflow-auto whitespace-pre-wrap rounded-[12px] bg-surface-2 p-4 text-[13.5px] leading-relaxed text-text">{agreement.content}</div>
      {alreadySigned ? (
        <div className="flex items-center gap-2 rounded-[11px] [background:var(--success-bg)] px-3 py-3 text-[13.5px] font-semibold text-success"><Icon name="check_circle" size={20} /> ההסכם נחתם על ידך.</div>
      ) : (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label-text">חתימה</span>
            <button onClick={clear} className="text-[12.5px] font-semibold text-link">ניקוי</button>
          </div>
          <canvas ref={canvasRef} width={480} height={150} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className="w-full touch-none rounded-[12px] border border-dashed border-border bg-surface" style={{ height: 150 }} />
        </div>
      )}
    </Modal>
  );
}
