import { ToastProvider } from "@/components/Toast";
import React from "react";
import { fireEvent, render as baseRender, screen } from "@testing-library/react";
import RadarSheet from "@/components/RadarSheet";

function mockRadarEnv() {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: jest.fn() },
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  });
}

beforeEach(() => {
  mockRadarEnv();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("overlay 手機版底部抽屜、桌機版水平垂直置中", () => {
  render(<RadarSheet isOpen onClose={jest.fn()} />);
  const dialog = screen.getByRole("dialog");
  const overlay = dialog.parentElement;
  expect(overlay).not.toBeNull();
  // 手機版：底部對齊；桌機版 sm+：垂直置中
  expect(overlay!.className).toMatch(/items-end/);
  expect(overlay!.className).toMatch(/sm:items-center/);
  // 水平置中
  expect(overlay!.className).toMatch(/justify-center/);
});

test("dialog 寬度受限且桌機版四角圓角置中", () => {
  render(<RadarSheet isOpen onClose={jest.fn()} />);
  const dialog = screen.getByRole("dialog");
  expect(dialog.className).toMatch(/w-full/);
  expect(dialog.className).toMatch(/max-w-2xl/);
  expect(dialog.className).toMatch(/mx-auto/);
  // 桌機版四角圓角，而非只有頂部圓角
  expect(dialog.className).toMatch(/sm:rounded-3xl/);
});

test("點擊遮罩關閉、點擊內容不關閉", () => {
  const onClose = jest.fn();
  render(<RadarSheet isOpen onClose={onClose} />);
  const dialog = screen.getByRole("dialog");
  const overlay = dialog.parentElement!;

  fireEvent.click(dialog);
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.click(overlay);
  expect(onClose).toHaveBeenCalledTimes(1);
});

function render(...args: Parameters<typeof baseRender>) {
  return baseRender(args[0], { wrapper: ToastProvider, ...args[1] });
}
