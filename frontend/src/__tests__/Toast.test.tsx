import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
    expect(screen.getByRole("alert")).toHaveTextContent("搜尋失敗");

    fireEvent.click(screen.getByRole("button", { name: "關閉通知" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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

    expect(screen.getByRole("alert")).toHaveTextContent("搜尋失敗");
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


describe("通知閱讀與去重", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("相同通知只出現一次，只有一個關閉計時器", () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    const button = screen.getByRole("button", { name: "觸發搜尋完成" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(1);
  });

  it("成功 4 秒關閉，錯誤保留 8 秒", () => {
    render(<ToastProvider><Trigger /><TriggerError /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "觸發搜尋完成" }));
    fireEvent.click(screen.getByRole("button", { name: "觸發失敗" }));
    act(() => jest.advanceTimersByTime(4000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(4000));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("滑鼠或鍵盤焦點停留時暫停，兩者離開後繼續倒數", () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "觸發搜尋完成" }));
    act(() => jest.advanceTimersByTime(2000));
    const notice = screen.getByRole("status");
    fireEvent.mouseEnter(notice);
    const close = screen.getByRole("button", { name: "關閉通知" });
    act(() => close.focus());
    act(() => jest.advanceTimersByTime(10000));
    fireEvent.mouseLeave(notice);
    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => close.blur());
    act(() => jest.advanceTimersByTime(1999));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("Strict Mode effect replay 後仍會自動關閉通知", () => {
    render(<React.StrictMode><ToastProvider><SearchCompleteToast total={1} searchKey="retry" active /></ToastProvider></React.StrictMode>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(4000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("相同搜尋失敗後重試成功仍給予回饋", () => {
    const { rerender } = render(<ToastProvider><SearchCompleteToast total={0} searchKey="same" active failed /></ToastProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("搜尋失敗");
    rerender(<ToastProvider><SearchCompleteToast total={2} searchKey="same" active failed={false} /></ToastProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("共 2 筆");
  });
});
