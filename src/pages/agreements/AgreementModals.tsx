import { useEffect, useRef, useState } from "react";
import { Button, Field, Icon, Input, Select, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useBusinessId } from "@/lib/db";
import { uploadAgreementFile, useSignAgreement } from "@/api/agreements";
import type { AgreementSignature, AgreementTemplate, AgreementType, Profile } from "@/types/database";
import { TYPE_LABELS } from "./types";

export function AgreementEditorModal({
  template,
  employees,
  onClose,
  onSave,
  saving,
}: {
  template: AgreementTemplate | null;
  employees: Profile[];
  onClose: () => void;
  onSave: (i: { title: string; type: AgreementType; content: string; file_url?: string | null; employee_id?: string | null }) => Promise<void>;
  saving: boolean;
}) {
  const businessId = useBusinessId();
  const [title, setTitle] = useState(template?.title ?? "");
  const [type, setType] = useState<AgreementType>(template?.type ?? "work");
  const [content, setContent] = useState(template?.content ?? "");
  const [scope, setScope] = useState<"global" | "personal">(template?.employee_id ? "personal" : "global");
  const [employeeId, setEmployeeId] = useState(template?.employee_id ?? "");
  const [fileUrl, setFileUrl] = useState(template?.file_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const isFixedType = type === "sexual_harassment";

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;
    setUploading(true);
    setErr("");
    try {
      setFileUrl(await uploadAgreementFile(businessId, file));
    } catch {
      setErr("שגיאה בהעלאת הקובץ. ודאו שקיים Bucket בשם agreements ב-Storage.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? "עריכת תבנית" : "תבנית הסכם חדשה"}
      icon="draw"
      maxWidth={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button
            className="flex-1"
            loading={saving || uploading}
            onClick={() =>
              title.trim() &&
              onSave({
                title: title.trim(),
                type,
                content: content.trim(),
                file_url: fileUrl || null,
                employee_id: isFixedType || scope === "global" ? null : employeeId || null,
              })
            }
          >
            שמירה
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="כותרת"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="סוג">
          <Select value={type} onChange={(e) => setType(e.target.value as AgreementType)}>
            {(Object.keys(TYPE_LABELS) as AgreementType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </Select>
        </Field>
        {!isFixedType && (
          <Field label="היקף">
            <Select value={scope} onChange={(e) => setScope(e.target.value as "global" | "personal")}>
              <option value="global">קבוע — לכל העובדים</option>
              <option value="personal">דינאמי — לעובד ספציפי</option>
            </Select>
          </Field>
        )}
        {scope === "personal" && !isFixedType && (
          <Field label="עובד/ת">
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">בחר/י עובד</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="תוכן ההסכם"><Textarea value={content} onChange={(e) => setContent(e.target.value)} className="h-36" /></Field>
        <Field label="קובץ מצורף (PDF / DOC)">
          <Input type="file" accept=".pdf,.doc,.docx" onChange={handleFile} disabled={uploading} />
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 text-[12.5px] font-semibold text-link">
              <Icon name="attach_file" size={16} /> צפייה בקובץ
            </a>
          )}
        </Field>
        {err && <p className="text-[12px] font-semibold text-danger">{err}</p>}
      </div>
    </Modal>
  );
}

export function ReadSignModal({
  agreement,
  employeeId,
  signature,
  onClose,
}: {
  agreement: AgreementTemplate;
  employeeId: string;
  signature?: AgreementSignature;
  onClose: () => void;
}) {
  const businessId = useBusinessId();
  const sign = useSignAgreement(businessId);
  const alreadySigned = !!signature?.agreed;
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || alreadySigned) return;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#1e1b3a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
  }, [alreadySigned]);

  function pos(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent) {
    drawing.current = true;
    const { x, y } = pos(e);
    canvasRef.current!.getContext("2d")!.beginPath();
    canvasRef.current!.getContext("2d")!.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const { x, y } = pos(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  }
  function up() { drawing.current = false; }
  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  }

  async function submit() {
    await sign.mutateAsync({
      business_id: businessId!,
      agreement_id: agreement.id,
      employee_id: employeeId,
      signature_data: canvasRef.current!.toDataURL("image/png"),
    });
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={agreement.title}
      subtitle={TYPE_LABELS[agreement.type]}
      icon="draw"
      maxWidth={560}
      footer={
        alreadySigned ? (
          <Button className="flex-1" onClick={onClose}>סגירה</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>ביטול</Button>
            <Button className="flex-1" disabled={!hasDrawn} loading={sign.isPending} onClick={submit}>אני מאשר/ת וחותם/ת</Button>
          </>
        )
      }
    >
      {agreement.file_url && (
        <a href={agreement.file_url} target="_blank" rel="noreferrer" className="mb-3 flex items-center gap-2 rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-[13px] font-semibold text-link">
          <Icon name="attach_file" size={18} /> הורדת / צפייה במסמך המצורף
        </a>
      )}
      {agreement.content && (
        <div className="mb-4 max-h-[230px] overflow-auto whitespace-pre-wrap rounded-[12px] bg-surface-2 p-4 text-[13.5px] leading-relaxed text-text">{agreement.content}</div>
      )}
      {alreadySigned ? (
        <div>
          <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-success">
            <Icon name="check_circle" size={20} /> ההסכם נחתם
            {signature?.signed_at && <span className="text-[12px] font-normal text-text-3">· {new Date(signature.signed_at).toLocaleDateString("he-IL")}</span>}
          </div>
          {signature?.signature_data && (
            <img src={signature.signature_data} alt="חתימה" className="w-full rounded-[12px] border border-border bg-surface p-2" />
          )}
        </div>
      ) : (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label-text">חתימה דיגיטלית</span>
            <button onClick={clear} className="text-[12.5px] font-semibold text-link">ניקוי</button>
          </div>
          <canvas ref={canvasRef} width={480} height={150} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className="w-full touch-none rounded-[12px] border border-dashed border-border bg-surface" style={{ height: 150 }} />
          <p className="mt-2 text-[11.5px] text-text-3">חתמו/י בתיבה למעלה באמצעות העכבר או האצבע</p>
        </div>
      )}
    </Modal>
  );
}
