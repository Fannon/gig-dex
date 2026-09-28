import type { DragEvent } from "react";

export const songDragType = "application/x-gigdex-song";
export interface SongDrag {
  songId: string;
  listId?: string;
  index?: number;
}
export function writeSongDrag(event: DragEvent, source: SongDrag, title: string) {
  event.dataTransfer.setData(songDragType, JSON.stringify(source));
  event.dataTransfer.setData("text/plain", title);
  event.dataTransfer.effectAllowed = source.listId ? "copyMove" : "copy";
}
export function readSongDrag(event: DragEvent): SongDrag | undefined {
  try {
    const value = JSON.parse(event.dataTransfer.getData(songDragType));
    if (typeof value.songId !== "string" || !value.songId) return;
    if (
      value.listId !== undefined &&
      (typeof value.listId !== "string" || !Number.isInteger(value.index) || value.index < 0)
    )
      return;
    return { songId: value.songId, listId: value.listId, index: value.index };
  } catch {
    return;
  }
}
