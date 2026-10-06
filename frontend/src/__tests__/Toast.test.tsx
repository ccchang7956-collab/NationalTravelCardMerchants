import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/Toast";
import SearchCompleteToast from "@/components/SearchCompleteToast";

function Trigger() {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => toast.success("搜尋完成", "共 123 筆符合的結果")}
    >
      觸發搜尋完成
    </button>
  );
}

function TriggerInfo() {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => toast.info("搜尋完成", "沒有符合的結果，試試簡化關鍵字或重設篩選")}
    >
      觸發空結果
    </button>
  );
}

function TriggerError() {
  const { toast } = useToast();
  return (
    <button
      type="button"
      onClick={() => toast.error("搜尋失敗", "目前無法取得搜尋結果，請稍後重試")}
    >
      觸發失敗
    </button>
  );
}

describe("Toast", () => {
  it("成功搜尋後顯示完成訊息與筆數", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "觸發搜尋完成" }));

    expect(screen.getByRole("status")).toHaveTextContent("搜尋完成");
    expect(screen.getByRole("status")).toHaveTextContent("共 123 筆符合的結果");
  });

  it("空結果顯示提醒樣式訊息", () => {
    render(
      <ToastProvider>
        <TriggerInfo />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "觸發空結果" }));

    expect(screen.getByRole("status")).toHaveTextContent("搜尋完成");
    expect(screen.getByRole("status")).toHaveTextContent("沒有符合的結果");
  });

  it("失敗時顯示錯誤訊息且可手動關閉", () => {
    render(
      <ToastProvider>
        <TriggerError />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "觸發失敗" }));
    expect(screen.getByRole("status")).toHaveTextContent("搜尋失敗");

    fireEvent.click(screen.getByRole("button", { name: "關閉通知" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("在 Provider 外使用會拋出清楚錯誤", () => {
    function Outside() {
      const { toast } = useToast();
      return (
        <button type="button" onClick={() => toast.success("x")}>
          外部
        </button>
      );
    }
    // 壓住 console.error：預期會拋錯
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Outside />)).toThrow("必須在 <ToastProvider> 內使用");
    spy.mockRestore();
  });
});

describe("SearchCompleteToast", () => {
  it("有結果時顯示成功與筆數", () => {
    render(
      <ToastProvider>
        <SearchCompleteToast total={123} searchKey="咖啡|||true|1" active failed={false} />
      </ToastProvider>
    );

    expect(screen.getByRole("status")).toHaveTextContent("搜尋完成");
    expect(screen.getByRole("status")).toHaveTextContent("共 123 筆符合的結果");
  });

  it("零筆時顯示空結果提醒", () => {
    render(
      <ToastProvider>
        <SearchCompleteToast total={0} searchKey="xxx|||true|1" active failed={false} />
      </ToastProvider>
    );

    expect(screen.getByRole("status")).toHaveTextContent("沒有符合的結果");
  });

  it("載入失敗時顯示錯誤", () => {
    render(
      <ToastProvider>
        <SearchCompleteToast total={0} searchKey="q|||true|1" active failed />
      </ToastProvider>
    );

    expect(screen.getByRole("status")).toHaveTextContent("搜尋失敗");
  });

  it("首訪無參數時不打擾", () => {
    render(
      <ToastProvider>
        <SearchCompleteToast total={999} searchKey="|||null|1" active={false} failed={false} />
      </ToastProvider>
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
