import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPatch } from "@/lib/http";

const ROOM_LABEL_MAX_LEN = 80;
const ROOM_LABEL_MAX_COUNT = 50;

type ClinicRoomsSettingsPanelProps = {
  clinicId: string;
  roomLabels: string[];
  canEdit: boolean;
};

type DeleteTarget = { index: number; name: string };

function normalizeDraft(labels: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of labels) {
    const name = raw.trim();
    if (!name) continue;
    const clipped = name.length > ROOM_LABEL_MAX_LEN ? name.slice(0, ROOM_LABEL_MAX_LEN) : name;
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
  }
  return out;
}

function listsEqual(a: string[], b: string[]): boolean {
  const na = normalizeDraft(a);
  const nb = normalizeDraft(b);
  return na.length === nb.length && na.every((v, i) => v === nb[i]);
}

function hasDuplicateName(rooms: string[], name: string, skipIndex?: number): boolean {
  const key = name.trim().toLowerCase();
  return rooms.some((r, i) => i !== skipIndex && r.trim().toLowerCase() === key);
}

export function ClinicRoomsSettingsPanel({ clinicId, roomLabels, canEdit }: ClinicRoomsSettingsPanelProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rooms, setRooms] = useState<string[]>(() => [...roomLabels]);
  const [newRoom, setNewRoom] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  useEffect(() => {
    setRooms([...roomLabels]);
    setEditingIndex(null);
    setEditDraft("");
    setNewRoom("");
    setDeleteTarget(null);
    setAddDialogOpen(false);
  }, [roomLabels]);

  const saveMut = useMutation({
    mutationFn: (payload: string[]) => apiPatch(`/api/v1/clinics/${clinicId}`, { frontDeskRoomLabels: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinic", clinicId] });
      void qc.invalidateQueries({ queryKey: ["clinics"] });
      void qc.invalidateQueries({ queryKey: ["front-desk"] });
      toast.success(t("clinics.roomsSaved", "Room list updated."));
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body
          ? String((e.body as { message?: unknown }).message)
          : e instanceof Error
            ? e.message
            : String(e);
      toast.error(msg);
    },
  });

  const persistRooms = (nextRooms: string[]) => {
    const normalized = normalizeDraft(nextRooms);
    if (normalized.length < 1) {
      toast.error(t("clinics.roomsMin", "Keep at least one room."));
      return;
    }
    if (nextRooms.filter((r) => r.trim()).length > ROOM_LABEL_MAX_COUNT) {
      toast.error(t("clinics.roomsMax", "You can configure up to {{max}} rooms.", { max: ROOM_LABEL_MAX_COUNT }));
      return;
    }
    if (listsEqual(normalized, roomLabels)) return;
    setRooms(normalized);
    saveMut.mutate(normalized);
  };

  const commitEdit = (index: number) => {
    const next = editDraft.trim();
    if (!next) {
      toast.error(t("clinics.roomsNameRequired", "Room name cannot be empty."));
      return;
    }
    if (hasDuplicateName(rooms, next, index)) {
      toast.error(t("clinics.roomsDuplicate", "A room with this name already exists."));
      return;
    }
    const nextRooms = rooms.map((r, i) => (i === index ? next : r));
    setEditingIndex(null);
    setEditDraft("");
    if (next === rooms[index]?.trim()) return;
    persistRooms(nextRooms);
  };

  const openAddDialog = () => {
    const next = newRoom.trim();
    if (!next) return;
    if (rooms.length >= ROOM_LABEL_MAX_COUNT) {
      toast.error(t("clinics.roomsMax", "You can configure up to {{max}} rooms.", { max: ROOM_LABEL_MAX_COUNT }));
      return;
    }
    if (hasDuplicateName(rooms, next)) {
      toast.error(t("clinics.roomsDuplicate", "A room with this name already exists."));
      return;
    }
    setAddDialogOpen(true);
  };

  const confirmAdd = () => {
    const next = newRoom.trim();
    if (!next) return;
    const nextRooms = [...rooms, next];
    setNewRoom("");
    setAddDialogOpen(false);
    persistRooms(nextRooms);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (rooms.length <= 1) {
      toast.error(t("clinics.roomsMin", "Keep at least one room."));
      setDeleteTarget(null);
      return;
    }
    const nextRooms = rooms.filter((_, i) => i !== deleteTarget.index);
    if (editingIndex === deleteTarget.index) {
      setEditingIndex(null);
      setEditDraft("");
    }
    setDeleteTarget(null);
    persistRooms(nextRooms);
  };

  const busy = saveMut.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("clinics.roomsSettings", "Exam rooms")}</CardTitle>
        <CardDescription>
          {t(
            "clinics.roomsSettingsHint",
            "Names shown on the front-desk live board (free vs in use). Rename with Edit → Done, or use Add / Delete — each change saves immediately after you confirm.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit ? (
          <>
            <ul className="space-y-2">
              {rooms.map((label, index) => (
                <li key={`${index}-${label}`} className="flex flex-wrap items-center gap-2">
                  {editingIndex === index ? (
                    <>
                      <Input
                        className="max-w-xs"
                        value={editDraft}
                        maxLength={ROOM_LABEL_MAX_LEN}
                        disabled={busy}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit(index);
                          if (e.key === "Escape") {
                            setEditingIndex(null);
                            setEditDraft("");
                          }
                        }}
                        aria-label={t("clinics.roomName", "Room name")}
                      />
                      <Button type="button" size="sm" disabled={busy} onClick={() => commitEdit(index)}>
                        {t("common.done", "Done")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setEditingIndex(null);
                          setEditDraft("");
                        }}
                      >
                        {t("common.cancel", "Cancel")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-[6rem] flex-1 text-sm font-medium">{label}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={busy || editingIndex !== null}
                        aria-label={t("clinics.editRoom", "Edit room")}
                        onClick={() => {
                          setEditingIndex(index);
                          setEditDraft(label);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={busy || rooms.length <= 1 || editingIndex !== null}
                        aria-label={t("clinics.deleteRoom", "Delete room")}
                        onClick={() => setDeleteTarget({ index, name: label })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-end gap-2 border-t pt-4">
              <div className="space-y-2">
                <Label htmlFor="clinic-new-room">{t("clinics.addRoom", "Add room")}</Label>
                <Input
                  id="clinic-new-room"
                  className="max-w-xs"
                  value={newRoom}
                  maxLength={ROOM_LABEL_MAX_LEN}
                  disabled={busy || editingIndex !== null}
                  placeholder={t("clinics.roomNamePlaceholder", "e.g. Room 4")}
                  onChange={(e) => setNewRoom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openAddDialog();
                  }}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={!newRoom.trim() || busy || editingIndex !== null}
                onClick={openAddDialog}
              >
                <Plus className="me-1 size-4" />
                {t("common.add", "Add")}
              </Button>
            </div>
          </>
        ) : (
          <ul className="list-inside list-disc text-sm">
            {roomLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          if (!busy) setAddDialogOpen(open);
        }}
        variant="default"
        icon={<DoorOpen className="h-5 w-5" aria-hidden />}
        title={t("clinics.roomsAddConfirmTitle", "Add exam room?")}
        description={t(
          "clinics.roomsAddConfirmIntro",
          "This room will appear on the front-desk live board for this clinic. You can rename or remove it later.",
        )}
        confirmLabel={t("clinics.roomsAddConfirmAction", "Add room")}
        cancelLabel={t("common.cancel", "Cancel")}
        pending={busy}
        onConfirm={confirmAdd}
        details={
          newRoom.trim() ? (
            <dl className="space-y-1">
              <dt className="text-xs text-muted-foreground">{t("clinics.roomName", "Room name")}</dt>
              <dd className="font-medium">{newRoom.trim()}</dd>
            </dl>
          ) : null
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!busy && !open) setDeleteTarget(null);
        }}
        title={t("clinics.roomsDeleteConfirmTitle", "Remove exam room?")}
        description={t(
          "clinics.roomsDeleteConfirmIntro",
          "The room is removed from this clinic’s list. The live board will no longer show it. Existing room assignments today are not changed automatically.",
        )}
        confirmLabel={t("clinics.roomsDeleteConfirmAction", "Remove room")}
        cancelLabel={t("common.cancel", "Cancel")}
        pending={busy}
        onConfirm={confirmDelete}
        details={
          deleteTarget ? (
            <dl className="space-y-1">
              <dt className="text-xs text-muted-foreground">{t("clinics.roomName", "Room name")}</dt>
              <dd className="font-medium">{deleteTarget.name}</dd>
            </dl>
          ) : null
        }
      />
    </Card>
  );
}
