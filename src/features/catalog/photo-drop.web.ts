import { useEffect, useRef, useState, type RefObject } from "react";
import type { ViewInstance } from "react-native";

import { PickImageError, squareJpeg } from "@/features/media/pick-image";

/**
 * The size of the image at `uri`, as expo-image-manipulator reads it on the web (an `<img>`'s
 * natural size). From its header: the browser decodes its pixels only when they are drawn, where a
 * render (renderAsync) decodes them and encodes a PNG of them.
 */
function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new PickImageError("unreadable", "The image could not be read"));
    image.src = uri;
  });
}

/**
 * The image of a dropped file, as a photo picked (squareJpeg); null when the file is no image.
 * Rejects with a PickImageError ("unreadable") when the image cannot be read (a format the browser
 * does not decode) or made small enough: told to the owner, never a photo silently left out.
 */
async function droppedPhoto(file: File): Promise<Uint8Array | null> {
  if (!file.type.startsWith("image/")) return null;
  const uri = URL.createObjectURL(file);
  try {
    // Its size first: the square is cut from its middle.
    const { width, height } = await imageSize(uri);
    return await squareJpeg(uri, width, height, "article");
  } finally {
    URL.revokeObjectURL(uri);
  }
}

/**
 * Drops of a photo onto `target` ("Items", desktop: "Drop a photo here"): the first file dropped is
 * handed over at once as the bytes it will give, still being made (droppedPhoto). `dragging` while
 * a file is held over the view. react-native-web renders a View as a DOM element.
 */
export function usePhotoDrop(
  target: RefObject<ViewInstance | null>,
  onDrop: (bytes: Promise<Uint8Array | null>) => void
): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  // The latest handler, without adding the listeners again at each render of the form.
  const handler = useRef(onDrop);
  useEffect(() => {
    handler.current = onDrop;
  }, [onDrop]);
  useEffect(() => {
    const node = target.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== "function") return;
    const holdsFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes("Files");
    const over = (event: DragEvent) => {
      if (!holdsFiles(event)) return;
      // Without it, the browser opens the file instead of dropping it here.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      // Moving over a child of the view leaves the view too: only leaving it for outside counts.
      if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
      setDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!holdsFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) handler.current(droppedPhoto(file));
    };
    node.addEventListener("dragover", over);
    node.addEventListener("dragleave", leave);
    node.addEventListener("drop", drop);
    return () => {
      node.removeEventListener("dragover", over);
      node.removeEventListener("dragleave", leave);
      node.removeEventListener("drop", drop);
    };
  }, [target]);
  return { dragging };
}
