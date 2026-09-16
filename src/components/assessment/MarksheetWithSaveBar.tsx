"use client";

import { useRef, useState } from "react";
import MarksheetGrid, { type MarksheetGridHandle, type MarksheetSaveState } from "./MarksheetGrid";
import MarksheetSaveBar from "./MarksheetSaveBar";

const IDLE_STATE: MarksheetSaveState = {
  hasEdits: false,
  editCount: 0,
  cellErrorCount: 0,
  saving: false,
  saveError: null,
};

type GridProps = Omit<React.ComponentProps<typeof MarksheetGrid>, "onStateChange">;

interface Props extends GridProps {
  /** Class summary link shown once everything is saved — omit to hide it. */
  summaryHref?: string;
}

export default function MarksheetWithSaveBar({ summaryHref, ...gridProps }: Props) {
  const gridRef = useRef<MarksheetGridHandle>(null);
  const [state, setState] = useState<MarksheetSaveState>(IDLE_STATE);

  return (
    <>
      <MarksheetGrid ref={gridRef} {...gridProps} onStateChange={setState} />
      {!gridProps.readOnly && (
        <>
          <MarksheetSaveBar
            state={state}
            onSave={() => gridRef.current?.save()}
            onDiscard={() => gridRef.current?.discard()}
            summaryHref={summaryHref}
          />
          <div className="h-20" />
        </>
      )}
    </>
  );
}
