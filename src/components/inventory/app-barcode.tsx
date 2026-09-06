"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function AppBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      JsBarcode(ref.current, value, { format: "CODE128", height: 48, displayValue: true, fontSize: 12 });
    }
  }, [value]);
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} className="max-w-full" />;
}
