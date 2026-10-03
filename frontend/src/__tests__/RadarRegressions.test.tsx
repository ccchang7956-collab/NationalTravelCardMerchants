import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RadarSheet from "@/components/RadarSheet";

test("older nearby responses cannot overwrite a newer radius search", async () => {
  let gps: PositionCallback = () => {};
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: jest.fn(callback => { gps = callback; }) } });
  const replies: ((response: unknown) => void)[] = [];
  global.fetch = jest.fn().mockImplementation(() => new Promise(resolve => replies.push(resolve)));
  render(<RadarSheet isOpen onClose={jest.fn()} />);
  await waitFor(() => expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled());
  await act(async () => { gps({ coords: { latitude: 25, longitude: 121 } } as GeolocationPosition); });
  fireEvent.click(screen.getByRole("button", { name: "2.0 km" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await act(async () => { replies[1]({ ok: true, json: async () => [{ id: 2, name: "新的結果" }] }); });
  expect(screen.getByText("新的結果")).toBeInTheDocument();
  await act(async () => { replies[0]({ ok: true, json: async () => [{ id: 1, name: "過期結果" }] }); });
  expect(screen.queryByText("過期結果")).not.toBeInTheDocument();
  expect(screen.getByText("新的結果")).toBeInTheDocument();
});

test("late GPS callbacks are ignored after manual search and closing", async () => {
  let gps: PositionCallback = () => {};
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: jest.fn(callback => { gps = callback; }) } });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: 2, name: "手動結果" }] }) });
  const { rerender } = render(<RadarSheet isOpen onClose={jest.fn()} />);
  await waitFor(() => expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled());
  fireEvent.change(screen.getByPlaceholderText(/搜尋地址/), { target: { value: "咖啡" } });
  fireEvent.click(screen.getByRole("button", { name: "搜尋" }));
  expect(await screen.findByText("手動結果")).toBeInTheDocument();
  await act(async () => { gps({ coords: { latitude: 25, longitude: 121 } } as GeolocationPosition); });
  expect(fetch).toHaveBeenCalledTimes(1);
  rerender(<RadarSheet isOpen={false} onClose={jest.fn()} />);
  await act(async () => { gps({ coords: { latitude: 25, longitude: 121 } } as GeolocationPosition); });
  expect(fetch).toHaveBeenCalledTimes(1);
});
