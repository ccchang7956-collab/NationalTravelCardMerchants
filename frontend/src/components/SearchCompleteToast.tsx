"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";

interface SearchCompleteToastProps {
  total: number;
  searchKey: string;
  /** 是否為一次搜尋（有帶查詢參數）；首訪無參數時不打擾 */
  active: boolean;
  failed?: boolean;
}

export default function SearchCompleteToast({
  total,
  searchKey,
  active,
  failed = false,
}: SearchCompleteToastProps) {
  const { toast } = useToast();
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active && !failed) return;
    const resultKey = `${searchKey}|${failed ? "failed" : total}`;
    if (lastKeyRef.current === resultKey) return;
    lastKeyRef.current = resultKey;

    if (failed) {
      toast.error("搜尋失敗", "目前無法取得搜尋結果，請稍後重試");
      return;
    }
    if (total > 0) {
      toast.success("搜尋完成", `共 ${total.toLocaleString()} 筆符合的結果`);
    } else {
      toast.info("搜尋完成", "沒有符合的結果，試試簡化關鍵字或重設篩選");
    }
  }, [active, failed, searchKey, total, toast]);

  return null;
}
