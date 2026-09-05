"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { PageActionButton, PageActions } from "@/components/page-actions";
import { ReverseDialog } from "@/components/journal/reverse-button";

export function DetailActions({
  entryId,
  entryNumber,
  canReverse,
}: {
  entryId: string;
  entryNumber: string;
  canReverse: boolean;
}) {
  const [reverseOpen, setReverseOpen] = useState(false);

  if (!canReverse) return null;

  return (
    <PageActions>
      <PageActionButton
        variant="secondary"
        icon={<Undo2 />}
        onClick={() => setReverseOpen(true)}
      >
        Buat Balikan
      </PageActionButton>
      <ReverseDialog
        entryId={entryId}
        entryNumber={entryNumber}
        open={reverseOpen}
        onOpenChange={setReverseOpen}
      />
    </PageActions>
  );
}
