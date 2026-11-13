import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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

export function ClinicRoomsSettingsPanel({ clinicId, roomLabels, canEdit }: ClinicRoomsSettingsPanelProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [rooms, setRooms] = useState<string[]>(() => [...roomLabels]);
  const [newRoom, setNewRoom] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    setRooms([...roomLabels]);
    setEditingIndex(null);
    setEditDraft("");
    setNewRoom("");
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

  const normalizedRooms = normalizeDraft(rooms);
  const normalizedSaved = normalizeDraft(roomLabels);
  const unchanged =
    normalizedRooms.length === normalizedSaved.length &&
    normalizedRooms.every((v, i) => v === normalizedSaved[i]);
  const tooFew = normalizedRooms.length < 1;
  const tooMany = rooms.filter((r) => r.trim()).length > ROOM_LABEL_MAX_COUNT;

  const commitEdit = (index: number) => {
    const next = editDraft.trim();
    if (!next) {
      toast.error(t("clinics.roomsNameRequired", "Room name cannot be empty."));
      return;
    }
    setRooms((prev) => prev.map((r, i) => (i === index ? next : r)));
    setEditingIndex(null);
    setEditDraft("");
  };

  const addRoom = () => {
    const next = newRoom.trim();
    if (!next) return;
    if (rooms.length >= ROOM_LABEL_MAX_COUNT) {
      toast.error(t("clinics.roomsMax", "You can configure up to {{max}} rooms.", { max: ROOM_LABEL_MAX_COUNT }));
      return;
    }
    setRooms((prev) => [...prev, next]);
    setNewRoom("");
  };

  const removeRoom = (index: number) => {
    if (rooms.length <= 1) {
      toast.error(t("clinics.roomsMin", "Keep at least one room."));
      return;
    }
    setRooms((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditDraft("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("clinics.roomsSettings", "Exam rooms")}</CardTitle>
        <CardDescription>
          {t(
            "clinics.roomsSettingsHint",
            "Names shown on the front-desk live board (free vs in use). Add, rename, or remove rooms for this clinic.",
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
                      <Button type="button" size="sm" onClick={() => commitEdit(index)}>
                        {t("common.done", "Done")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
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
                        disabled={rooms.length <= 1}
                        aria-label={t("clinics.deleteRoom", "Delete room")}
                        onClick={() => removeRoom(index)}
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
                  placeholder={t("clinics.roomNamePlaceholder", "e.g. Room 4")}
                  onChange={(e) => setNewRoom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addRoom();
                  }}
                />
              </div>
              <Button type="button" variant="secondary" disabled={!newRoom.trim()} onClick={addRoom}>
                <Plus className="me-1 size-4" />
                {t("common.add", "Add")}
              </Button>
            </div>
            {tooFew ? (
              <p className="text-sm text-destructive">{t("clinics.roomsMin", "Keep at least one room.")}</p>
            ) : null}
            {tooMany ? (
              <p className="text-sm text-destructive">
                {t("clinics.roomsMax", "You can configure up to {{max}} rooms.", { max: ROOM_LABEL_MAX_COUNT })}
              </p>
            ) : null}
            <Button
              type="button"
              disabled={saveMut.isPending || unchanged || tooFew || tooMany}
              onClick={() => saveMut.mutate(normalizedRooms)}
            >
              {t("common.save", "Save")}
            </Button>
          </>
        ) : (
          <ul className="list-inside list-disc text-sm">
            {roomLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
