import { useEffect, useRef, useState } from "react";

import { logFailure } from "@/lib/log/log";
import { inviteLinkOf, parseInviteFragment, type InviteLink } from "@/lib/team/invite";

import { JoinError, joinTeam, previewInvite, type InvitePreview, type JoinFailure } from "./member";

export type JoinState =
  /** No invitation yet: the scanner, or a link pasted. */
  | { phase: "scan"; invalid: boolean }
  | { phase: "checking" }
  /** Read and checked: the employee confirms. */
  | { phase: "preview"; preview: InvitePreview }
  | { phase: "joining"; preview: InvitePreview }
  | { phase: "joined" }
  | { phase: "failed"; failure: JoinFailure };

function failureOf(error: unknown): JoinFailure {
  if (error instanceof JoinError) return error.code;
  logFailure("Joining the team failed", error);
  return "unreachable";
}

/**
 * The invitation page (src/app/join.tsx): the link it was opened with (`fragment`), else one
 * scanned or pasted, is read and shown before the device joins: an invitation is used once, a
 * scan by mistake must not use it.
 */
export function useJoin(fragment: string) {
  const [state, setState] = useState<JoinState>(() =>
    fragment === "" || fragment === "#"
      ? { phase: "scan", invalid: false }
      : parseInviteFragment(fragment)
        ? { phase: "checking" }
        : { phase: "failed", failure: "invalid" }
  );
  // One invitation read at a time: a code stays in the camera's view for a while.
  const reading = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );

  const read = (link: InviteLink) => {
    if (reading.current) return;
    reading.current = true;
    setState({ phase: "checking" });
    previewInvite(link).then(
      (preview) => {
        reading.current = false;
        if (alive.current) setState({ phase: "preview", preview });
      },
      (error: unknown) => {
        reading.current = false;
        if (alive.current) setState({ phase: "failed", failure: failureOf(error) });
      }
    );
  };

  // The link the page was opened with.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const link = parseInviteFragment(fragment);
    if (link) read(link);
    // Read once, at the first render: the page is keyed by its fragment (src/app/join.tsx).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    /** A code scanned or a link pasted: its invitation is read, anything else is flagged. */
    submit: (text: string) => {
      if (state.phase !== "scan" || reading.current) return;
      const link = inviteLinkOf(text) ?? parseInviteFragment(text.trim());
      if (link) read(link);
      else setState({ phase: "scan", invalid: true });
    },
    confirm: () => {
      if (state.phase !== "preview") return;
      const { preview } = state;
      setState({ phase: "joining", preview });
      joinTeam(preview).then(
        () => {
          if (alive.current) setState({ phase: "joined" });
        },
        (error: unknown) => {
          if (alive.current) setState({ phase: "failed", failure: failureOf(error) });
        }
      );
    },
    /** Back to the scanner. */
    restart: () => setState({ phase: "scan", invalid: false })
  };
}
